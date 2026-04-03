const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
//const PORT = 3000;
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'transactions.json');
const SAVING_FILE = path.join(__dirname, 'saving.json');
const BUDGET_FILE = path.join(__dirname, 'budgets.json');
// Helper: Đọc/Ghi Ngân sách
const readBudgets = () => {
    if (!fs.existsSync(BUDGET_FILE)) { fs.writeFileSync(BUDGET_FILE, JSON.stringify({})); return {}; }
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
};
const writeBudgets = (data) => fs.writeFileSync(BUDGET_FILE, JSON.stringify(data, null, 4));

// Middleware
app.use(cors()); // Cho phép gọi API từ frontend (khác port hoặc từ file://)
app.use(express.json()); // Parse body JSON

// Hàm helper: Đọc dữ liệu từ file JSON
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data) || []; // Thêm || [] để an toàn
    } catch (error) {
        return [];
    }
};

// Hàm helper: Ghi dữ liệu vào file JSON
const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
    } catch (error) {
        console.error("Lỗi ghi file:", error);
    }
};

// Helper functions để đọc/ghi file an toàn
// Cập nhật hàm readJSON để đảm bảo luôn trả về đúng kiểu dữ liệu mong muốn
const readJSON = (filePath, defaultData = []) => {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 4));
            return defaultData;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        // Cường hóa: Nếu file tồn tại nhưng không phải mảng (trong khi ta cần mảng)
        if (Array.isArray(defaultData) && !Array.isArray(data)) {
            return defaultData; 
        }
        return data;
    } catch (error) {
        return defaultData;
    }
};

const writeJSON = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
};

// ==========================================
// API CHO TIẾT KIỆM (SAVINGS) - MỚI
// ==========================================

app.use(express.static(path.join(__dirname, ''))); 
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

app.get('/api/saving', (req, res) => {
    const savings = readJSON(SAVING_FILE);
    res.json({ success: true, data: savings });
});

app.post('/api/saving', (req, res) => {
    try {
        const { name, amount, target, date } = req.body;
        if (!name || !amount) return res.status(400).json({ success: false, message: "Thiếu tên hoặc số tiền" });

        let savings = readJSON(SAVING_FILE, []); // Luôn ép kiểu mảng
        
        const newSaving = {
            id: Date.now().toString(),
            name,
            amount: Number(amount),
            target: Number(target) || 0,
            date: date || new Date().toISOString().split('T')[0]
        };

        savings.push(newSaving);
        writeJSON(SAVING_FILE, savings);
        res.status(201).json({ success: true, data: newSaving });
    } catch (error) {
        console.error("Lỗi Server:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi lưu tiết kiệm" });
    }
});

app.delete('/api/saving/:id', (req, res) => {
    const savings = readJSON(SAVING_FILE);
    const filtered = savings.filter(s => s.id !== req.params.id);
    writeJSON(SAVING_FILE, filtered);
    res.json({ success: true, message: "Đã xóa khoản tiết kiệm" });
});

// ==========================================
// API ROUTES
// ==========================================

// 1. GET: Lấy danh sách giao dịch (Có hỗ trợ filter)
app.get('/api/transactions', (req, res) => {
    let transactions = readData();
    const { type, month, year } = req.query;

    // Lọc theo loại (thu/chi)
    if (type) {
        transactions = transactions.filter(t => t.type === type);
    }
    
    // Lọc theo tháng năm (YYYY-MM)
    if (month && year) {
        transactions = transactions.filter(t => {
            const date = new Date(t.date);
            return date.getMonth() + 1 == month && date.getFullYear() == year;
        });
    }

    // Sắp xếp mới nhất lên đầu
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({ success: true, data: transactions });
});

// 2. POST: Thêm giao dịch mới
app.post('/api/transactions', (req, res) => {
    const { amount, date, source, category, note, type } = req.body;

    // Validate cơ bản
    if (!amount || !date || !type) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc" });
    }

    const transactions = readData();
    const newTransaction = {
        id: Date.now().toString(), // Tạo ID đơn giản bằng timestamp
        amount: Number(amount),
        date,
        source: source || 'Tiền mặt',
        category,
        note: note || '',
        type // 'income' hoặc 'expense'
    };

    transactions.push(newTransaction);
    writeData(transactions);

    res.status(201).json({ success: true, message: "Đã thêm giao dịch", data: newTransaction });
});

// 3. PUT: Cập nhật giao dịch
app.put('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    let transactions = readData();

    const index = transactions.findIndex(t => t.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
    }

    // Cập nhật dữ liệu
    transactions[index] = { ...transactions[index], ...updateData };
    writeData(transactions);

    res.status(200).json({ success: true, message: "Đã cập nhật", data: transactions[index] });
});

// 4. DELETE: Xóa giao dịch
app.delete('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    let transactions = readData();

    const filtered = transactions.filter(t => t.id !== id);
    
    if (transactions.length === filtered.length) {
        return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
    }

    writeData(filtered);
    res.status(200).json({ success: true, message: "Đã xóa giao dịch" });
});

// Chạy server
app.listen(PORT, () => {
    console.log(`🚀 Server Backend Finly đang chạy tại: http://localhost:${PORT}`);
});

// --- API MỚI ---

// 1. Lấy dữ liệu Dòng tiền 12 tháng (Cashflow)
app.get('/api/stats/cashflow', (req, res) => {
    const transactions = readData();
    const result = {};
    
    // Khởi tạo 12 tháng gần nhất
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        result[key] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
        const monthKey = t.date.substring(0, 7); // YYYY-MM
        if (result[monthKey]) {
            if (t.type === 'income') result[monthKey].income += t.amount;
            else result[monthKey].expense += t.amount;
        }
    });

    res.json({ success: true, data: result });
});

// 2. Lấy dữ liệu phân bổ theo Danh mục (Tháng hiện tại)
app.get('/api/stats/categories', (req, res) => {
    const { month, year, type = 'expense' } = req.query;
    const transactions = readData();
    const summary = {};

    transactions.forEach(t => {
        const d = new Date(t.date);
        if (t.type === type && (d.getMonth() + 1) == month && d.getFullYear() == year) {
            summary[t.category] = (summary[t.category] || 0) + t.amount;
        }
    });

    res.json({ success: true, data: summary });
});

// 3. Quản lý Ngân sách (Budgets)
app.get('/api/budgets', (req, res) => {
    res.json({ success: true, data: readBudgets() });
});

app.post('/api/budgets', (req, res) => {
    const { category, limit } = req.body;
    const budgets = readBudgets();
    budgets[category] = Number(limit);
    writeBudgets(budgets);
    res.json({ success: true, message: "Đã cập nhật hạn mức" });
});