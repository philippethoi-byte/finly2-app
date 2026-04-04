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

// API Cập nhật giao dịch theo ID
app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { amount, date, category, source, note, type } = req.body;

    try {
        const { data, error } = await supabase
            .from('transactions')
            .update({ 
                amount, 
                date, 
                category,   
                source, 
                note, 
                type 
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
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




// ==========================================
// API QUẢN LÝ NỢ (DEBTS)
// ==========================================

// 1. GET: Lấy danh sách tất cả khoản nợ
app.get('/api/debts', async (req, res) => {
    const { data, error } = await supabase
        .from('debts')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data });
});

// 2. POST: Thêm khoản nợ mới
app.post('/api/debts', async (req, res) => {
    const { debt_name, creditor_debtor, type, amount, interest_rate, interest_period, due_date, note } = req.body;
    
    const { data, error } = await supabase
        .from('debts')
        .insert([{
            debt_name,
            creditor_debtor,
            type, // 'owe_to' hoặc 'owe_me'
            amount,
            remaining_amount: amount, // Mới tạo thì nợ gốc = số tiền vay
            interest_rate,
            interest_period,
            due_date,
            note,
            status: 'active'
        }])
        .select();

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data });
});

// 3. PUT: Cập nhật thông tin khoản nợ
app.put('/api/debts/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
        .from('debts')
        .update(updateData)
        .eq('id', id)
        .select();

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data });
});

// 4. DELETE: Xóa khoản nợ (Sẽ tự động xóa debt_logs nhờ ON DELETE CASCADE)
app.delete('/api/debts/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('debts').delete().eq('id', id);

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, message: "Đã xóa khoản nợ thành công" });
});

// ==========================================
// API NHẬT KÝ TRẢ NỢ (DEBT LOGS)
// ==========================================

// 1. GET: Lấy lịch sử trả của một khoản nợ cụ thể
app.get('/api/debts/:id/logs', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('debt_logs')
        .select('*')
        .eq('debt_id', id)
        .order('payment_date', { ascending: false });

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, data });
});

// 2. POST: Thực hiện trả nợ (Gồm Gốc + Lãi)
app.post('/api/debts/pay', async (req, res) => {
    const { debt_id, principal_paid, interest_paid, payment_date, note } = req.body;

    try {
        // BƯỚC A: Ghi log trả nợ
        const { error: logError } = await supabase
            .from('debt_logs')
            .insert([{
                debt_id,
                principal_paid,
                interest_paid,
                payment_date,
                note
            }]);

        if (logError) throw logError;

        // BƯỚC B: Cập nhật bảng debts (Trừ tiền gốc còn lại và cộng dồn lãi đã trả)
        // Lấy dữ liệu hiện tại để tính toán
        const { data: debt } = await supabase.from('debts').select('*').eq('id', debt_id).single();
        
        const newRemaining = debt.remaining_amount - principal_paid;
        const newTotalInterest = (Number(debt.total_interest_paid) || 0) + Number(interest_paid);
        const newStatus = newRemaining <= 0 ? 'completed' : 'active';

        const { error: updateError } = await supabase
            .from('debts')
            .update({ 
                remaining_amount: newRemaining,
                total_interest_paid: newTotalInterest,
                status: newStatus
            })
            .eq('id', debt_id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Đã cập nhật khoản thanh toán thành công" });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. DELETE: Xóa một lần trả tiền (Cần cộng lại tiền vào bảng debts nếu xóa)
app.delete('/api/debt-logs/:logId', async (req, res) => {
    const { logId } = req.params;
    
    try {
        // Lấy thông tin log trước khi xóa để hoàn tác tiền
        const { data: log } = await supabase.from('debt_logs').select('*').eq('id', logId).single();
        if (!log) return res.status(404).json({ success: false, message: "Không tìm thấy log" });

        const { data: debt } = await supabase.from('debts').select('*').eq('id', log.debt_id).single();

        // Xóa log
        await supabase.from('debt_logs').delete().eq('id', logId);

        // Hoàn tác lại số dư trong bảng debts
        await supabase.from('debts').update({
            remaining_amount: debt.remaining_amount + log.principal_paid,
            total_interest_paid: debt.total_interest_paid - log.interest_paid,
            status: 'active'
        }).eq('id', log.debt_id);

        res.json({ success: true, message: "Đã xóa và hoàn tác số dư thành công" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server Finly chạy tại: http://localhost:${PORT}`));


