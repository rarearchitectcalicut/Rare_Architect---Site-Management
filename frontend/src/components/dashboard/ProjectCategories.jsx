
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    FolderKanban,
    Images,
    RefreshCw,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../LoadingScreen";

// =====================================================
// CATEGORY IMAGE CARD
// =====================================================

function CategoryCard({ category }) {
    const [imageFailed, setImageFailed] = useState(false);

    const imageUrl = getMediaUrl(category.image);
    const showImage = Boolean(imageUrl) && !imageFailed;

    return (
        <Link
            to={`/admin/categories/${category.id}`}
            className="
        group block overflow-hidden
        rounded-3xl
        border border-[#e8dfd3]
        bg-[#fffdfa]
        transition-all duration-300
        hover:-translate-y-1
        hover:shadow-[0_15px_35px_rgba(33,30,26,0.10)]
        focus-visible:outline-2
        focus-visible:outline-offset-4
        focus-visible:outline-[#211e1a]
      "
        >
            {/* CATEGORY COVER IMAGE */}
            <div className="relative aspect-4/3 overflow-hidden bg-[#e8dfd3] sm:aspect-5/3">
                {showImage ? (
                    <img
                        src={imageUrl}
                        alt={category.name}
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                        className="
              h-full w-full object-cover
              transition-transform duration-500
              group-hover:scale-105
            "
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#e8dfd3]">
                        <Images
                            size={36}
                            strokeWidth={1.4}
                            className="text-[#8a8175]"
                        />

                        <span className="text-xs text-[#8a8175]">
                            No cover image
                        </span>
                    </div>
                )}

                {/* FLOATING ARROW */}
                <div
                    className="
            absolute right-4 bottom-4
            flex h-11 w-11
            items-center justify-center
            rounded-full
            bg-[#fffdfa]
            text-[#211e1a]
            shadow-md
            transition-colors
            group-hover:bg-[#211e1a]
            group-hover:text-white
          "
                >
                    <ArrowUpRight size={20} strokeWidth={1.8} />
                </div>
            </div>

            {/* CATEGORY DETAILS */}
            <div className="p-5 sm:p-6">
                <h3 className="text-lg font-bold tracking-tight text-[#211e1a] sm:text-xl">
                    {category.name}
                </h3>

                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#8a8175]">
                    {category.description ||
                        "Explore projects in this category."}
                </p>

                <div className="mt-5 flex items-center gap-2 border-t border-[#eee6dc] pt-4 text-sm font-semibold text-[#211e1a]">
                    <FolderKanban size={17} />
                    View Projects
                    <ArrowUpRight size={16} className="ml-auto" />
                </div>
            </div>
        </Link>
    );
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
                const response = await projectApi.getCategories();

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
                    setCategories(items);
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

        return () => {
            cancelled = true;
        };
    }, [retryKey]);

    return (
        <section className="space-y-5">
            {loading && (
                <LoadingScreen message="Loading project categories..." />
            )}

            {/* SECTION HEADER */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a8175]">
                        Explore RARE
                    </p>

                    <h2 className="text-2xl font-bold tracking-tight text-[#211e1a] sm:text-[28px]">
                        Project Categories
                    </h2>

                    <p className="mt-2 text-sm text-[#8a8175]">
                        Explore our architecture and construction projects
                        by category.
                    </p>
                </div>
            </div>

            {/* ERROR */}
            {!loading && error && (
                <div className="rounded-[22px] border border-[#e8dfd3] bg-[#fffdfa] p-7 text-center">
                    <p role="alert" className="text-sm text-[#9e3535]">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={() => setRetryKey((previous) => previous + 1)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#211e1a] px-5 py-3 text-sm font-semibold text-white"
                    >
                        <RefreshCw size={17} />
                        Try Again
                    </button>
                </div>
            )}

            {/* EMPTY STATE */}
            {!loading && !error && categories.length === 0 && (
                <div className="rounded-[22px] border border-[#e8dfd3] bg-[#fffdfa] px-6 py-12 text-center">
                    <FolderKanban
                        size={34}
                        strokeWidth={1.5}
                        className="mx-auto text-[#8a8175]"
                    />

                    <h3 className="mt-4 text-lg font-semibold text-[#211e1a]">
                        No project categories yet
                    </h3>

                    <p className="mt-2 text-sm text-[#8a8175]">
                        Categories created in Django will appear here.
                    </p>
                </div>
            )}

            {/* CATEGORY IMAGE GRID */}
            {!error && categories.length > 0 && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {categories.map((category) => (
                        <CategoryCard
                            key={category.id}
                            category={category}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
