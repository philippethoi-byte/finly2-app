require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE
// Thay thế bằng thông tin trong phần Project Settings > API của bạn
const SUPABASE_URL = 'https://jvokwjafghldbirxdrxc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1LiCttO5w0UJ-zW8Z9IF_Q_v36iNFRO';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

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
    const { data, error } = await supabase.from('savings').select('*');
    if (error) return res.status(500).json({ success: false });
    res.json({ success: true, data });
});

app.post('/api/saving', async (req, res) => {
    const { name, amount, target } = req.body;
    const { data, error } = await supabase
        .from('savings')
        .insert([{ name, amount: Number(amount), target: Number(target) }])
        .select();
    if (error) return res.status(500).json({ success: false });
    res.json({ success: true, data: data[0] });
});

app.delete('/api/saving/:id', async (req, res) => {
    await supabase.from('savings').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// ==========================================
// API THỐNG KÊ (Dòng tiền 6 tháng)
// ==========================================
app.get('/api/stats/cashflow', async (req, res) => {
    const { data: transactions, error } = await supabase.from('transactions').select('amount, date, type');
    if (error) return res.status(500).json({ success: false });

    const result = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        result[key] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
        const monthKey = t.date.substring(0, 7);
        if (result[monthKey]) {
            if (t.type === 'income') result[monthKey].income += Number(t.amount);
            else result[monthKey].expense += Number(t.amount);
        }
    });
    res.json({ success: true, data: result });
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
    const { error } = await supabase
        .from('budgets')
        .upsert({ category, limit_amount: Number(limit) });
    res.json({ success: !error });
});

// Phục vụ giao diện
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server Finly chạy tại: http://localhost:${PORT}`));