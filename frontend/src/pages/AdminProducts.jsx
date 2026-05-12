import Layout from "../components/Layout";
import { useState, useEffect } from "react";
import api from "../api/axios";
import { toast } from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getCurrencySymbol, formatCurrency } from "../utils/currency";

const AdminProducts = () => {
    const { user } = useAuth();
    const role = user?.role;
    const isViewer = role === "viewer";

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: "",
        warehouse_name: "",
        shelf_code: "",
        category: "raw_material",
        unit: "pcs",
        cost_per_unit: 0
    });
    const [editingProduct, setEditingProduct] = useState(null);
    const [editData, setEditData] = useState({ name: "", description: "", category: "raw_material", unit: "pcs", cost_per_unit: 0 });

    const fetchProducts = async () => {
        try {
            const res = await api.get("/products");
            setProducts(res.data);
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    const handleAddProduct = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.post("/products", {
                name: newProduct.name,
                warehouse_name: newProduct.warehouse_name,
                shelf_code: newProduct.shelf_code,
                category: newProduct.category,
                unit: newProduct.unit,
                cost_per_unit: newProduct.cost_per_unit
            });

            toast.success("Product added successfully!");
            setNewProduct({ name: "", warehouse_name: "", shelf_code: "", category: "raw_material", unit: "pcs", cost_per_unit: 0 });
            setShowAddForm(false);
            fetchProducts();
        } catch (error) {
            const errorMsg = error.response?.data?.error || "Failed to add product.";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (p) => {
        setEditingProduct(p);
        setEditData({ 
            name: p.name, 
            description: p.description || "",
            category: p.category || "raw_material",
            unit: p.unit || "pcs",
            cost_per_unit: p.cost_per_unit || 0
        });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/products/${editingProduct.id}`, editData);
            setEditingProduct(null);
            fetchProducts();
            toast.success("Product details updated.");
        } catch (err) {
            toast.error("Failed to update product details.");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure? This will delete the product and all its stock. Proceed?")) return;
        try {
            await api.delete(`/products/${id}`);
            fetchProducts();
            toast.success("Product deleted.");
        } catch (err) {
            toast.error("Delete failed. Product may be in use.");
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <div style={{ maxWidth: "1250px", margin: "0 auto" }}>
                <header className="flex justify-between align-center mb-3" style={{ flexWrap: "wrap", gap: "1.5rem" }}>
                    <div>
                        <h1 style={{ letterSpacing: "-1.5px" }}>All <span className="text-accent">Products</span></h1>
                        <p className="text-muted" style={{ fontWeight: 600, fontSize: "0.8rem", letterSpacing: "1px" }}>MANAGE ALL PRODUCTS</p>
                    </div>
                    <div className="flex gap-1">
                        <div style={{ position: "relative", width: "320px" }}>
                          <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔍</span>
                          <input
                              type="text"
                              placeholder="Search products..."
                              style={{ paddingLeft: "42px", height: "3.5rem", borderRadius: "12px", fontSize: "0.9rem" }}
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>
                        {!isViewer && (
                            <button onClick={() => setShowAddForm(!showAddForm)} style={{ height: "3.5rem", padding: "0 1.5rem", fontWeight: 800 }}>
                                {showAddForm ? "CLOSE FORM" : "+ NEW ENTRY"}
                            </button>
                        )}
                    </div>
                </header>

                {showAddForm && (
                    <div className="card glass-card mb-2" style={{ borderLeft: "4px solid var(--primary)", padding: "2.5rem" }}>
                        <h2 style={{ fontSize: "1.25rem", letterSpacing: "-0.5px", marginBottom: "1.5rem" }}>Add New Product</h2>
                        <form onSubmit={handleAddProduct} className="flex flex-column gap-1">
                            <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                                <div style={{ flex: 2, minWidth: "250px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>PRODUCT NAME</label>
                                    <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Asset Name" required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }} />
                                </div>
                                <div style={{ flex: 1, minWidth: "200px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>WAREHOUSE</label>
                                    <input type="text" value={newProduct.warehouse_name} onChange={(e) => setNewProduct({ ...newProduct, warehouse_name: e.target.value })} placeholder="e.g. Main Store" required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }} />
                                </div>
                                <div style={{ flex: 1, minWidth: "150px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>SHELF CODE</label>
                                    <input type="text" value={newProduct.shelf_code} onChange={(e) => setNewProduct({ ...newProduct, shelf_code: e.target.value })} placeholder="e.g. BIN-01" required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }} />
                                </div>
                            </div>

                            <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: "200px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>CATEGORY</label>
                                    <select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} style={{ height: "3.5rem", backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "white", padding: "0 1rem", borderRadius: "12px" }}>
                                        <option value="raw_material">RAW MATERIAL</option>
                                        <option value="spare_part">SPARE PART</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1, minWidth: "150px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>UNIT</label>
                                    <input type="text" value={newProduct.unit} onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })} placeholder="pcs, kg, etc." style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }} />
                                </div>
                                <div style={{ flex: 1, minWidth: "150px" }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>COST / UNIT ({getCurrencySymbol(user?.company)})</label>
                                    <input type="number" value={newProduct.cost_per_unit} onChange={(e) => setNewProduct({ ...newProduct, cost_per_unit: e.target.value })} placeholder="0.00" style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }} />
                                </div>
                            </div>

                            <div className="flex justify-end mt-1">
                                <button type="submit" disabled={loading} style={{ height: "3.5rem", padding: "0 2rem", fontWeight: 900 }}>
                                    {loading ? "LOADING..." : "ADD PRODUCT"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="card glass-card" style={{ padding: 0, borderRadius: "16px", overflow: "hidden" }}>
                    <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Product List</h2>
                      <p className="text-muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{filteredProducts.length} TOTAL PRODUCTS</p>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                            <thead style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                                <tr>
                                    <th style={{ padding: "1.25rem 2rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>PRODUCT NAME</th>
                                    <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>SKU</th>
                                    <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>CATEGORY</th>
                                    <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>UNIT COST</th>
                                    <th style={{ padding: "1.25rem", fontSize: "0.65rem", letterSpacing: "1px", color: "var(--text-muted)" }}>DETAILS</th>
                                    <th style={{ padding: "1.25rem 2rem", textAlign: "right" }}>CONTROL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && products.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: "center", padding: "4rem" }}>LOADING PRODUCT DATA...</td></tr>
                                ) : filteredProducts.length > 0 ? (
                                    filteredProducts.map((p) => (
                                        <tr key={p.id}>
                                            <td style={{ padding: "1.25rem 2rem", fontWeight: 800, color: "var(--primary)", fontSize: "1rem" }}>{p.name}</td>
                                            <td style={{ padding: "1.25rem" }}>
                                                <code style={{ background: "rgba(255,255,255,0.05)", padding: "0.25rem 0.6rem", borderRadius: "4px", fontSize: "0.8rem", color: "white" }}>{p.sku}</code>
                                            </td>
                                            <td style={{ padding: "1.25rem" }}>
                                                <span style={{ 
                                                    padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.65rem", fontWeight: 800,
                                                    backgroundColor: p.category === "spare_part" ? "rgba(99, 102, 241, 0.1)" : "rgba(16, 185, 129, 0.1)",
                                                    color: p.category === "spare_part" ? "#6366f1" : "var(--success)",
                                                    border: `1px solid ${p.category === "spare_part" ? "#6366f1" : "var(--success)"}`
                                                }}>{p.category?.replace('_', ' ').toUpperCase()}</span>
                                            </td>
                                            <td style={{ padding: "1.25rem", fontWeight: 700 }}>{formatCurrency(p.cost_per_unit, user?.company)} / {p.unit || 'pcs'}</td>
                                            <td className="text-muted" style={{ padding: "1.25rem", fontSize: "0.85rem", fontWeight: 500 }}>{p.description || "No details provided."}</td>
                                            <td style={{ padding: "1.25rem 2rem", textAlign: "right" }}>
                                                {!isViewer && (role === "admin" || role === "user" || role === "super_admin") && (
                                                    <div className="flex gap-1 justify-end">
                                                        <button className="btn-sm" onClick={() => handleEditClick(p)} style={{ background: "rgba(255,255,255,0.05)", fontWeight: 800 }}>SPECS</button>
                                                        {(role === "admin" || role === "super_admin") && (
                                                            <button className="btn-sm" onClick={() => handleDelete(p.id)} style={{ background: "rgba(225, 29, 72, 0.1)", color: "var(--accent)", fontWeight: 800 }}>DELETE</button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="6" style={{ textAlign: "center", padding: "4rem" }} className="text-muted">NO PRODUCTS FOUND.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {editingProduct && (
                <div style={{
                    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)"
                }}>
                    <div className="card glass-card" style={{ width: "100%", maxWidth: "460px", padding: "3rem" }}>
                        <h2 style={{ letterSpacing: "-1px", fontSize: "1.25rem", marginBottom: "1.5rem" }}>Edit <span className="text-accent">Product</span></h2>
                        <form onSubmit={handleUpdate} className="flex flex-column gap-1">
                            <div>
                                <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>PRODUCT NAME</label>
                                <input type="text" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} required style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", color: "white" }} />
                            </div>
                             <div>
                                <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>PRODUCT DETAILS</label>
                                <textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} style={{ height: "80px", resize: "none", backgroundColor: "rgba(255,255,255,0.03)", color: "white", padding: "1rem" }} placeholder="Enter product details..." />
                            </div>
                            <div className="flex gap-1">
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>CATEGORY</label>
                                    <select value={editData.category} onChange={(e) => setEditData({ ...editData, category: e.target.value })} style={{ height: "3.5rem", backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "white", padding: "0 1rem", borderRadius: "12px" }}>
                                        <option value="raw_material">RAW MATERIAL</option>
                                        <option value="spare_part">SPARE PART</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>UNIT</label>
                                    <input type="text" value={editData.unit} onChange={(e) => setEditData({ ...editData, unit: e.target.value })} style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", color: "white" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", marginBottom: "0.6rem", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>COST / UNIT ({getCurrencySymbol(user?.company)})</label>
                                    <input type="number" value={editData.cost_per_unit} onChange={(e) => setEditData({ ...editData, cost_per_unit: e.target.value })} style={{ height: "3.5rem", backgroundColor: "rgba(255,255,255,0.03)", color: "white" }} />
                                </div>
                            </div>
                            <div className="flex gap-1 justify-end mt-2">
                                <button type="button" onClick={() => setEditingProduct(null)} style={{ flex: 1, backgroundColor: "#334155" }}>CANCEL</button>
                                <button type="submit" style={{ flex: 1, backgroundColor: "var(--primary)" }}>SAVE CHANGES</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default AdminProducts;
