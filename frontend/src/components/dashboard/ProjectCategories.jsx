
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    FolderKanban,
    Building2,
    RefreshCw,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";


// =====================================================
// CATEGORY IMAGE CARD
// =====================================================

function CategoryCard({ category }) {
    const [imageFailed, setImageFailed] = useState(false);

    const imageUrl = getMediaUrl(category.image);
    const showImage = Boolean(imageUrl) && !imageFailed;

    return <Link to={`/admin/categories/${category.id}`} className="rare-category-card" aria-label={`View projects in ${category.name}`}>
        <span className="rare-category-cover" aria-hidden="true">
            {showImage ? <img src={imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <Building2 size={28} strokeWidth={1.5} />}
        </span>
        <div className="rare-category-card-body"><h3>{category.name}</h3><p>{category.description || "Explore projects in this category."}</p><span className="rare-category-card-action">View projects <ArrowUpRight size={14} aria-hidden="true" /></span></div>
    </Link>;
}

// =====================================================
// PROJECT CATEGORIES SECTION
// =====================================================

export default function ProjectCategories() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const loadCategories = async () => {
            setLoading(true);
            setError("");

            try {
                const response = await projectApi.getCategories({ is_active: true });

                // Supports plain DRF lists and paginated results.
                const items = Array.isArray(response)
                    ? response
                    : response?.results;

                if (!Array.isArray(items)) {
                    throw new Error(
                        "Unexpected category API response format."
                    );
                }

                if (!cancelled) {
                    setCategories(items.filter((category) => category.is_active !== false));
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.response?.status === 403
                            ? "You do not have permission to view project categories."
                            : "Unable to load project categories."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadCategories();

        return () => { cancelled = true; };
    }, [retryKey]);

    return <section className="rare-category-section" aria-labelledby="dashboard-categories-heading">
        <header className="rare-category-heading"><div><p className="rare-category-eyebrow">Explore your portfolio</p><h2 id="dashboard-categories-heading">Project Categories</h2><p>Find the right projects, organised by category.</p></div>{!loading && !error && <span className="rare-category-count">{categories.length} {categories.length === 1 ? "category" : "categories"}</span>}</header>
        {loading && <div role="status" className="rare-category-loading">Loading project categories...</div>}
        {!loading && error && <div className="rare-category-message"><p role="alert">{error}</p><button type="button" className="rare-button rare-button-secondary" onClick={() => setRetryKey((previous) => previous + 1)}><RefreshCw size={16} aria-hidden="true" />Try Again</button></div>}
        {!loading && !error && categories.length === 0 && <div className="rare-category-message"><FolderKanban size={24} aria-hidden="true" /><h3>No active project categories</h3><p>Active categories will appear here. Manage inactive categories in Settings.</p></div>}
        {!loading && !error && categories.length > 0 && <div className="rare-category-grid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>}
    </section>;
}
