import Layout from "../components/Layout";
import { useState, useEffect } from "react";
import api from "../api/axios";
import { toast } from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { stockRowKey, groupByLocation } from "../utils/warehouse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const AdminStock = () => {
    const { user } = useAuth();
    const role = user?.role;
    const isViewer = role === "viewer";

    const [stock, setStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const [editingItem, setEditingItem] = useState(null);
    const [editData, setEditData] = useState({ quantity: 0, shelf_code: "" });

    const fetchStock = async () => {
        try {
            const res = await api.get("/stock");
            setStock(res.data);
        } catch (err) {
            console.error("Error fetching stock:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchStock(); }, []);

    const handleDelete = async (item) => {
        if (!window.confirm("Delete this item from stock?")) return;
        try {
            await api.delete(`/stock/${item.id}`);
            fetchStock();
            toast.success("Stock record deleted successfully.");
        } catch (err) {
            toast.error("Failed to delete stock record.");
        }
    };

    const handleEditClick = (item) => {
        setEditingItem(item);
        setEditData({ quantity: item.quantity, shelf_code: item.shelf_code || "" });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/stock/${editingItem.id}`, editData);
            setEditingItem(null);
            fetchStock();
            toast.success("Stock record updated successfully.");
        } catch (err) {
            toast.error("Failed to update stock record.");
        }
    };

    const handleDownloadReport = () => {
        const toastId = toast.loading("Creating Stock Report...");
        try {
            const doc = new jsPDF();
            const company = (localStorage.getItem("company") || "phoenix").toLowerCase();
            const companyLabel = company === 'inpack' ? 'Inpack Inventory' : 'Phoenix Stocks';

            doc.setFontSize(20);
            doc.setTextColor(12, 26, 61);
            doc.text(`${companyLabel} - All Stock List`, 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Report Period: ${new Date().toLocaleString()}`, 14, 28);

            const tableRows = filteredStock.map(s => [
                s.product_name || "—",
                s.product_sku || "N/A",
                s.warehouse_name || "—",
                s.shelf_code || "—",
                s.quantity ?? 0,
                Number(s.quantity ?? 0) < 20 ? "LOW STOCK" : "OPTIMAL"
            ]);

            autoTable(doc, {
                startY: 35,
                head: [["Product Name", "SKU", "Warehouse", "Shelf", "Qty", "Status"]],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [29, 71, 155] },
                styles: { fontSize: 8 }
            });

            doc.save(`Global_Stock_${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success("Stock Report Downloaded.", { id: toastId });
        } catch (err) {
            toast.error("PDF generation failed.", { id: toastId });
        }
    };

    const handleExportCSV = () => {
        try {
            const headers = ["Product Name,SKU,Warehouse,Shelf,Quantity,Status"];
            const rows = filteredStock.map(s =>
                `"${s.product_name}","${s.product_sku}","${s.warehouse_name}","${s.shelf_code}",${s.quantity},${Number(s.quantity) < 20 ? 'LOW' : 'OPTIMAL'}`
            );
            const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Inventory_Export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            toast.success("Stock Data Exported.");
        } catch (err) {
            toast.error("CSV export failed.");
        }
    };

    const StatusPill = ({ qty }) => {
        const q = Number(qty);
        const configs = {
            out: { label: "OUT", bg: "rgba(225, 29, 72, 0.1)", color: "#ff0000", border: "#ff0000" },
            low: { label: "LOW", bg: "rgba(234, 179, 8, 0.1)", color: "var(--warning)", border: "var(--warning)" },
            optimal: { label: "OPTIMAL", bg: "rgba(16, 185, 129, 0.1)", color: "var(--success)", border: "var(--success)" }
        };
        const config = q === 0 ? configs.out : q < 20 ? configs.low : configs.optimal;
        return (
            <span style={{
                padding: "0.25rem 0.6rem", borderRadius: "15px", fontSize: "0.6rem", fontWeight: 800,
                backgroundColor: config.bg, color: config.color, border: `1px solid ${config.border}`
            }}>{config.label}</span>
        );
    };

    const filteredStock = stock.filter(item =>
        (item.product_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (item.product_sku?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (item.warehouse_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
    );

    const stockByLocation = groupByLocation(filteredStock);

    const StockTable = ({ data, warehouseName }) => (
        <div className="card glass-card" style={{ padding: 0, marginBottom: "2rem", borderTop: "4px solid var(--accent)" }}>
            <div className="flex justify-between align-center" style={{ padding: "1.25rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <h2 style={{ fontSize: "1.1rem", letterSpacing: "-0.5px" }}>{warehouseName} <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 400 }}>— Stock List</span></h2>
                <span style={{ fontSize: "0.65rem", fontWeight: 900, color: "white", background: "rgba(255,255,255,0.15)", padding: "0.3rem 0.8rem", borderRadius: "20px", letterSpacing: "1px" }}>{data.length} LINE ITEMS</span>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                        <tr>
                            <th style={{ padding: "1.25rem 2rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>PRODUCT</th>
                            <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>SKU</th>
                            <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>CATEGORY</th>
                            <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>SHELF</th>
                            <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>AMOUNT</th>
                            <th style={{ padding: "1.25rem 2rem", textAlign: "right" }}>EDIT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(item => (
                            <tr key={stockRowKey(item)}>
                                <td style={{ padding: "1.25rem 2rem", fontWeight: 800 }}>{item.product_name}</td>
                                <td style={{ padding: "1.25rem" }}><code style={{ background: "rgba(255,255,255,0.05)", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem" }}>{item.product_sku || "N/A"}</code></td>
                                <td style={{ padding: "1.25rem" }}>
                                    <span style={{
                                        padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.6rem", fontWeight: 800,
                                        background: item.category === 'spare_part' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                        color: item.category === 'spare_part' ? '#6366f1' : 'var(--success)'
                                    }}>{item.category?.replace('_', ' ').toUpperCase() || 'RAW MATERIAL'}</span>
                                </td>
                                <td style={{ padding: "1.25rem", fontWeight: 700, color: "var(--primary)" }}>{item.shelf_code || "—"}</td>
                                <td style={{ padding: "1.25rem" }}>
                                    <div className="flex align-center gap-1">
                                        <span style={{ fontWeight: 900, minWidth: "30px" }}>{item.quantity}</span>
                                        <div style={{ width: "80px", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                                            <div style={{
                                                width: `${Math.min((item.quantity / 100) * 100, 100)}%`,
                                                height: "100%",
                                                background: Number(item.quantity) < 20 ? "var(--accent)" : "var(--success)",
                                                boxShadow: `0 0 10px ${Number(item.quantity) < 20 ? "rgba(249, 115, 22, 0.3)" : "rgba(16, 185, 129, 0.3)"}`
                                            }} />
                                        </div>
                                        <StatusPill qty={item.quantity} />
                                    </div>
                                </td>
                                <td style={{ padding: "1.25rem 2rem", textAlign: "right" }}>
                                    {!isViewer && role === "admin" && (
                                        <div className="flex justify-end gap-1">
                                            <button className="btn-sm" onClick={() => handleEditClick(item)} style={{ background: "rgba(255,255,255,0.05)", fontWeight: 800 }}>EDIT</button>
                                            <button className="btn-sm" onClick={() => handleDelete(item)} style={{ background: "rgba(225, 29, 72, 0.1)", color: "var(--accent)", fontWeight: 800 }}>DELETE</button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <Layout>
            <div style={{ maxWidth: "1250px", margin: "0 auto" }}>
                <header className="flex justify-between align-center mb-2" style={{ flexWrap: "wrap", gap: "1.5rem" }}>
                    <div>
                        <h1 style={{ letterSpacing: "-1.5px" }}>All <span className="text-accent">Warehouses</span></h1>
                        <p className="text-muted" style={{ fontWeight: 600, fontSize: "0.8rem", letterSpacing: "1px" }}>VIEW AND MANAGE STOCK</p>
                    </div>
                    <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                        <button onClick={handleDownloadReport} className="secondary" style={{ height: "3.5rem", padding: "0 1.5rem", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "1px" }}>⤓ PDF REPORT</button>
                        <button onClick={handleExportCSV} className="secondary" style={{ height: "3.5rem", padding: "0 1.5rem", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "1px", color: "var(--accent)" }}>📈 CSV EXPORT</button>
                        <div style={{ position: "relative", width: "320px" }}>
                            <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search products or warehouses..."
                                style={{ paddingLeft: "42px", height: "3.5rem", borderRadius: "12px", fontSize: "0.9rem" }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                {loading ? (
                    <div className="card glass-card" style={{ textAlign: "center", padding: "5rem" }}>
                        <div className="text-muted" style={{ fontWeight: 700, letterSpacing: "2px" }}>LOADING STOCK DATA...</div>
                    </div>
                ) : (
                    <div className="flex flex-column gap-2">
                        {Object.entries(stockByLocation).length > 0 ? (
                            Object.entries(stockByLocation).map(([location, items]) => (
                                <StockTable key={location} data={items} warehouseName={location} />
                            ))
                        ) : (
                            <div className="card glass-card" style={{ textAlign: "center", padding: "5rem" }}>
                                <div className="text-muted">No inventory records found.</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {editingItem && (
                <div style={{
                    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)"
                }}>
                    <div className="card glass-card" style={{ width: "100%", maxWidth: "420px", padding: "3rem" }}>
                        <header className="mb-2">
                            <h2 style={{ letterSpacing: "-1px" }}>Edit <span className="text-accent">Stock</span></h2>
                            <p className="text-muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Editing: {editingItem.product_name}</p>
                        </header>

                        <form onSubmit={handleUpdate} className="flex flex-column gap-1">
                            <div>
                                <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>SHELF CODE</label>
                                <input type="text" value={editData.shelf_code} onChange={(e) => setEditData({ ...editData, shelf_code: e.target.value })} required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", color: "white", padding: "0 1.25rem", border: "1px solid rgba(255,255,255,0.1)" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>QUANTITY</label>
                                <input type="number" value={editData.quantity} onChange={(e) => setEditData({ ...editData, quantity: e.target.value })} required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", color: "white", padding: "0 1.25rem", border: "1px solid rgba(255,255,255,0.1)" }} />
                            </div>
                            <div className="flex gap-1 justify-end mt-2">
                                <button type="button" onClick={() => setEditingItem(null)} style={{ flex: 1, backgroundColor: "#334155", color: "white", fontWeight: 800 }}>CANCEL</button>
                                <button type="submit" style={{ flex: 1, backgroundColor: "var(--primary)", color: "white", fontWeight: 800 }}>SAVE CHANGES</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default AdminStock;
