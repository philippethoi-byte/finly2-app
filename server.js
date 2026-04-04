require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE
const SUPABASE_URL = 'https://jvokwjafghldbirxdrxc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1LiCttO5w0UJ-zW8Z9IF_Q_v36iNFRO';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));
// =============thêm debug local - xóa khi upload lên server=============
//app.get('/', (req, res) => {
//    res.sendFile(path.join(__dirname, 'Index.html'));
//});
// ==========================================
// API GIAO DỊCH (TRANSACTIONS)
// ==========================================
app.get('/api/transactions', async (req, res) => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.post('/api/transactions', async (req, res) => {
    const { amount, date, source, category, note, type } = req.body;
    const { data, error } = await supabase
        .from('transactions')
        .insert([{ amount: Number(amount), date, source, category, note, type }])
        .select();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.status(201).json({ success: true, data: data[0] });
});

app.delete('/api/transactions/:id', async (req, res) => {
    const { error } = await supabase.from('transactions').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false });
    res.json({ success: true });
});

// ==========================================
// API TIẾT KIỆM (SAVINGS)
// ==========================================
app.get('/api/saving', async (req, res) => {
    const { data, error } = await supabase
        .from('savings')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.post('/api/saving', async (req, res) => {
    const { name, initial_amount, term_months, interest_rate, start_date } = req.body;
    
    const principal = Number(initial_amount);
    const months = Number(term_months);
    const rate = Number(interest_rate) / 100; // Đổi % sang số thập phân

    // Công thức tính lãi đơn (Phổ biến cho tiền gửi có kỳ hạn)
    // Lãi = Gốc * Lãi suất năm * (Số tháng / 12)
    const expected_interest = Math.round(principal * rate * (months / 12));
    const total_at_maturity = principal + expected_interest;

    // Tính ngày đáo hạn
    const start = new Date(start_date);
    const maturity = new Date(start.setMonth(start.getMonth() + months));

    const { data, error } = await supabase
        .from('savings')
        .insert([{
            name,
            initial_amount: principal,
            term_months: months,
            interest_rate: Number(interest_rate),
            start_date,
            maturity_date: maturity.toISOString().split('T')[0],
            expected_interest,
            total_at_maturity
        }]);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.delete('/api/saving/:id', async (req, res) => {
    const { error } = await supabase.from('savings').delete().eq('id', req.params.id);
    res.json({ success: !error });
});

// ==========================================
// API THỐNG KÊ (Dòng tiền & Danh mục)
// ==========================================
app.get('/api/stats/cashflow', async (req, res) => {
    const { data: transactions, error } = await supabase.from('transactions').select('amount, date, type');
    if (error) return res.status(500).json({ success: false });
	
	const currentYear = new Date().getFullYear();
    const result = {};
    // Khởi tạo mặc định 12 tháng cho năm hiện tại
    for (let m = 1; m <= 12; m++) {
        const monthKey = `${currentYear}-${String(m).padStart(2, '0')}`;
        result[monthKey] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
        const tDate = new Date(t.date);
        const tYear = tDate.getFullYear();
        const monthKey = t.date.substring(0, 7); // Định dạng YYYY-MM

        // Chỉ cộng vào nếu giao dịch thuộc năm hiện tại
        if (tYear === currentYear && result[monthKey]) {
            if (t.type === 'income') result[monthKey].income += Number(t.amount);
            else result[monthKey].expense += Number(t.amount);
        }
    });
    res.json({ success: true, data: result });
});

// ĐÃ DI CHUYỂN API NÀY LÊN TRÊN app.get('*')
app.get('/api/stats/categories', async (req, res) => {
    const { month, year, type = 'expense' } = req.query;
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, category, date, type');
    
    if (error) return res.json({ success: false, data: {} });

    const summary = {};
    transactions.forEach(t => {
        const d = new Date(t.date);
        if (t.type === type && (d.getMonth() + 1) == month && d.getFullYear() == year) {
            summary[t.category] = (summary[t.category] || 0) + Number(t.amount);
        }
    });
    res.json({ success: true, data: summary });
});

// ==========================================
// API NGÂN SÁCH (BUDGETS)
// ==========================================
app.get('/api/budgets', async (req, res) => {
    const { data, error } = await supabase.from('budgets').select('*');
    const budgetObj = {};
    if (data) data.forEach(b => budgetObj[b.category] = b.limit_amount);
    res.json({ success: true, data: budgetObj });
});

app.post('/api/budgets', async (req, res) => {
    const { category, limit } = req.body;
    const { error } = await supabase.from('budgets').upsert({ category, limit_amount: Number(limit) });
    res.json({ success: !error });
});

// PHỤC VỤ GIAO DIỆN PHẢI NẰM Ở CUỐI CÙNG
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server Finly chạy tại: http://localhost:${PORT}`));