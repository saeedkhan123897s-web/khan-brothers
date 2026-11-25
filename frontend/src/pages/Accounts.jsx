import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function Accounts() {
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    async function load() {
      const s = await supabase.from("sales").select("*");
      const p = await supabase.from("purchases").select("*");
      const e = await supabase.from("expenses").select("*");
      if (s.data) setSales(s.data);
      if (p.data) setPurchases(p.data);
      if (e.data) setExpenses(e.data);
    }
    load();
  }, []);

  const jama = sales.reduce((a, x) => a + Number(x.total_amount || x.price || 0), 0);
  const kharcha = purchases.reduce((a, x) => a + Number(x.total_amount || x.price || 0), 0) + expenses.reduce((a, x) => a + Number(x.amount || 0), 0);
  const bacha = jama - kharcha;

  const download = () => {
    const csv = `Total Jama,${jama}\nTotal Kharcha,${kharcha}\nBacha,${bacha}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "accounts.csv";
    a.click();
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>💰 Accounts - Poora Hisab</h2>
      <button onClick={download} style={{ background: "#16a34a", color: "#fff", padding: "10px 18px", border: "none", borderRadius: 8 }}>⬇️ Download Report</button>
      <button onClick={() => window.print()} style={{ background: "#111", color: "#fff", padding: "10px 18px", border: "none", borderRadius: 8, marginLeft: 8 }}>🖨️ Print / PDF</button>
      <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
        <div style={{ background: "#dcfce7", padding: 15, borderRadius: 12, flex: 1 }}><p>Total Jama</p><h2>Rs {jama}</h2></div>
        <div style={{ background: "#fee2e2", padding: 15, borderRadius: 12, flex: 1 }}><p>Total Kharcha</p><h2>Rs {kharcha}</h2></div>
        <div style={{ background: "#000", color: "#fff", padding: 15, borderRadius: 12, flex: 1 }}><p>Bacha Hua</p><h2>Rs {bacha}</h2></div>
      </div>
      <p style={{ marginTop: 20 }}>Sales: {sales.length} | Purchases: {purchases.length} | Expenses: {expenses.length}</p>
    </div>
  );
}
