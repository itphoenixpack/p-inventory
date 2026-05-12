import Layout from "../components/Layout";
import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-hot-toast";

const UpdateStock = () => {
    useAuth();
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [formData, setFormData] = useState({
        product_id: "",
        warehouse_name: "",
        quantity: "",
        shelf_code: ""
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const suggestionRef = useRef(null);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await api.get("/products");
                setProducts(res.data);
            } catch (error) {
                console.error("Error fetching products:", error);
            }
        };
        fetchProducts();
    }, []);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectProduct = (p) => {
        setFormData({ ...formData, product_id: p.id });
        setSearchTerm(`${p.name} (${p.sku})`);
        setShowSuggestions(false);
    };

    const handleAction = async (action) => {
        if (!formData.quantity || !formData.warehouse_name || !formData.product_id) {
            toast.error("Please fill in all fields.");
            return;
        }

        setLoading(true);
        setMessage({ type: "", text: "" });
        try {
            const endpoint = action === "add" ? "/stock/add" : "/stock/remove";
            await api.post(endpoint, {
                product_id: parseInt(formData.product_id),
                warehouse_name: formData.warehouse_name,
                quantity: parseInt(formData.quantity),
                shelf_code: formData.shelf_code
            });
            toast.success(`Stock ${action === "add" ? "Added" : "Removed"} successfully.`);
            setFormData(prev => ({ ...prev, quantity: "", shelf_code: "" }));
            // We keep product_id and searchTerm if user wants to add more of the same item, 
            // but the user might want it cleared. Let's clear it to be safe.
            setFormData({ product_id: "", warehouse_name: formData.warehouse_name, quantity: "", shelf_code: "" });
            setSearchTerm("");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update stock.");
        } finally {
            setLoading(false);
        }
    };

    const filteredSuggestions = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 8);

    return (
        <Layout>
            <div style={{ maxWidth: "900px", margin: "0 auto" }}>
                <header className="mb-2">
                    <h1>Update <span className="text-accent">Stock</span></h1>
                    <p className="text-muted">Add or remove items from the warehouse.</p>
                </header>

                <div className="card glass-card" style={{ borderTop: "4px solid var(--accent)", position: "relative" }}>
                    <h2 className="mb-2">Stock Update Form</h2>
                    <div className="flex flex-column gap-1">
                        
                        {/* Searchable Item Input */}
                        <div style={{ position: "relative" }} ref={suggestionRef}>
                            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>1. SEARCH PRODUCT</label>
                            <input
                                type="text"
                                placeholder="Type product name or SKU..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                style={{ height: "3.5rem" }}
                            />
                            {showSuggestions && searchTerm.length > 0 && (
                                <div style={{
                                    position: "absolute", top: "100%", left: 0, right: 0, 
                                    backgroundColor: "#1e293b", border: "1px solid var(--border)",
                                    borderRadius: "12px", marginTop: "5px", zIndex: 10,
                                    boxShadow: "0 10px 25px rgba(0,0,0,0.3)", overflow: "hidden"
                                }}>
                                    {filteredSuggestions.length > 0 ? filteredSuggestions.map(p => (
                                        <div 
                                            key={p.id} 
                                            onClick={() => handleSelectProduct(p)}
                                            style={{
                                                padding: "1rem", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)",
                                                transition: "background 0.2s"
                                            }}
                                            onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.05)"}
                                            onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                                        >
                                            <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>{p.name}</div>
                                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>SKU: {p.sku} | {p.category.toUpperCase().replace('_', ' ')}</div>
                                        </div>
                                    )) : (
                                        <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>No matching products found.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: "200px" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>2. WAREHOUSE</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Main Store, Building A"
                                    value={formData.warehouse_name}
                                    onChange={(e) => setFormData({ ...formData, warehouse_name: e.target.value })}
                                    style={{ height: "3.5rem" }}
                                />
                            </div>

                            <div style={{ flex: 1, minWidth: "150px" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>3. SHELF CODE</label>
                                <input
                                    type="text"
                                    placeholder="e.g. ALPHA-101"
                                    value={formData.shelf_code}
                                    onChange={(e) => setFormData({ ...formData, shelf_code: e.target.value })}
                                    style={{ height: "3.5rem" }}
                                />
                            </div>

                            <div style={{ flex: 1, minWidth: "150px" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>4. QUANTITY</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    style={{ height: "3.5rem" }}
                                />
                            </div>
                        </div>

                        <div className="flex gap-1 mt-2">
                            <button
                                style={{ flex: 1, height: "4.5rem", fontSize: "1.1rem", fontWeight: 900, letterSpacing: "1px" }}
                                onClick={() => handleAction("add")}
                                disabled={loading}
                            >
                                {loading ? "PROCESSING..." : "ADD STOCK (+)"}
                            </button>
                            <button
                                className="danger"
                                style={{ flex: 1, height: "4.5rem", fontSize: "1.1rem", fontWeight: 900, letterSpacing: "1px" }}
                                onClick={() => handleAction("remove")}
                                disabled={loading}
                            >
                                {loading ? "PROCESSING..." : "REMOVE STOCK (-)"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-3" style={{ textAlign: "center" }}>
                    <p className="text-muted" style={{ fontSize: "0.8rem" }}>
                        Cannot find the item? Go to <a href="/admin/products" style={{ color: "var(--accent)", fontWeight: 800 }}>All Products</a> to register it first.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default UpdateStock;
