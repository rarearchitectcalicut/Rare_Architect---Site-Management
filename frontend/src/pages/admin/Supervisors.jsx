import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    ChevronDown,
    Mail,
    Phone,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    UserCheck,
    UserX,
    UsersRound,
} from "lucide-react";

import { supervisorApi } from "../../api/supervisorApi";
import {
    getItems,
    supervisorName,
} from "../../utils/supervisorHelpers";
import AddSupervisor from "../../modal/admin/AddSupervisor";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// MOTION SYSTEM
// One orchestrated page-load sequence + hover feedback.
// Everything respects prefers-reduced-motion.
// =====================================================

const pageCss = `
  @keyframes rare-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* "backwards" (not "both") so hover transforms still work after the intro */
  .rare-rise {
    animation: rare-rise 600ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-fade {
    animation: rare-fade 450ms ease-out backwards;
    animation-delay: var(--d, 0ms);
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-rise,
    .rare-fade {
      animation: none !important;
    }
  }
`;

// Staggered delay helper (capped so late items never feel slow)
const stagger = (index, step = 60, max = 600) =>
    Math.min(index * step, max);

// Icon tile tones (literal class strings so Tailwind can detect them)
const tones = {
    blue: "bg-[#E8F0FE] text-[#2563EB]",
    green: "bg-[#E6F4EA] text-[#16A34A]",
    orange: "bg-[#FFF3E0] text-[#EA8A12]",
    violet: "bg-[#F1ECFE] text-[#7C3AED]",
    slate: "bg-[#ece8e2] text-[#72675b]",
};

// Avatar palette: each supervisor gets a stable colour from their name
const avatarTones = [
    "bg-[#E8F0FE] text-[#2563EB]",
    "bg-[#E6F4EA] text-[#16A34A]",
    "bg-[#FFF3E0] text-[#EA8A12]",
    "bg-[#F1ECFE] text-[#7C3AED]",
    "bg-[#fde8e6] text-[#9e3535]",
];

function avatarTone(name) {
    let hash = 0;

    for (let i = 0; i < name.length; i += 1) {
        hash = (hash * 31 + name.charCodeAt(i)) % 997;
    }

    return avatarTones[hash % avatarTones.length];
}

// Count-up hook for summary numbers
function useCountUp(target, duration = 800) {
    const end = Number(target) || 0;
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        const reduceMotion =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        if (reduceMotion || end === 0) {
            setDisplay(end);
            return undefined;
        }

        let frame;
        const start = performance.now();

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            setDisplay(Math.round(end * eased));

            if (progress < 1) {
                frame = requestAnimationFrame(tick);
            }
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, [end, duration]);

    return display;
}

function AnimatedNumber({ value }) {
    return <>{useCountUp(value).toLocaleString()}</>;
}

const selectClass = `
  h-12 w-full appearance-none rounded-xl
  border border-[#E4DCCD] bg-[#FFFDFA]
  pl-4 pr-10 text-sm text-[#211E1A]
  outline-none transition-all duration-200
  hover:border-[#CFC4B5]
  focus:border-[#211E1A]
  focus:ring-4 focus:ring-[#211E1A]/10
`;

// =====================================================
// DATA LOADING
// =====================================================

async function fetchAllSupervisors() {
    let response = await supervisorApi.list();
    const items = [...getItems(response)];

    // For paginated API responses, follow only
    // the backend's own next links.
    const visited = new Set();
    let next = response?.next;

    while (next) {
        const nextUrl = new URL(
            next,
            window.location.origin
        );

        if (visited.has(nextUrl.href)) break;
        visited.add(nextUrl.href);

        // Reuse the authenticated Axios client by
        // extracting the page number from the URL.
        const page = nextUrl.searchParams.get("page");

        if (!page) {
            throw new Error(
                "Unable to read Supervisor pagination."
            );
        }

        response = await supervisorApi.list({
            page: Number(page),
        });

        items.push(...getItems(response));
        next = response?.next;
    }

    return items;
}

// =====================================================
// SUPERVISORS PAGE
// =====================================================

export default function Supervisors() {
    const [supervisors, setSupervisors] = useState([]);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [sort, setSort] = useState("name");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [showAddSupervisor, setShowAddSupervisor] =
        useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const data = await fetchAllSupervisors();
                if (!cancelled) setSupervisors(data);
            } catch {
                if (!cancelled) {
                    setError(
                        "Unable to load supervisors. Please try again."
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const visibleSupervisors = useMemo(() => {
        const query = search.trim().toLowerCase();

        const filtered = supervisors.filter((person) => {
            const searchable = [
                supervisorName(person),
                person.username,
                person.phone,
                person.email,
            ].filter(Boolean).join(" ").toLowerCase();

            const matchesQuery = searchable.includes(query);

            const matchesStatus =
                status === "all" ||
                (status === "active" && person.is_active) ||
                (status === "inactive" && !person.is_active);

            return matchesQuery && matchesStatus;
        });

        return filtered.sort((a, b) => {
            if (sort === "name-desc") {
                return supervisorName(b).localeCompare(
                    supervisorName(a)
                );
            }

            if (sort === "username") {
                return (a.username || "").localeCompare(
                    b.username || ""
                );
            }

            if (sort === "newest") {
                return new Date(b.created_at || 0) -
                    new Date(a.created_at || 0);
            }

            if (sort === "oldest") {
                return new Date(a.created_at || 0) -
                    new Date(b.created_at || 0);
            }

            return supervisorName(a).localeCompare(
                supervisorName(b)
            );
        });
    }, [supervisors, search, status, sort]);

    const activeCount = supervisors.filter(
        (person) => person.is_active
    ).length;

    return (
        <div className="space-y-6 pb-6 sm:space-y-7">
            <style>{pageCss}</style>

            {loading && (
                <LoadingScreen message="Loading supervisors..." />
            )}

            {/* HEADING */}
            <div className="rare-fade flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#948778]">
                        Admin / Team Management
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                        Supervisors
                    </h1>

                    <p className="mt-2 text-sm text-[#817669]">
                        Manage accounts and project assignments.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAddSupervisor(true)}
                    className="
                        group inline-flex items-center gap-2 rounded-xl bg-[#211E1A]
                        px-4 py-3 text-sm font-semibold text-white
                        shadow-[0_6px_18px_rgba(33,30,26,0.16)]
                        transition-all duration-200 ease-out
                        hover:-translate-y-0.5 hover:bg-[#38332C]
                        hover:shadow-[0_12px_26px_rgba(33,30,26,0.24)]
                        active:translate-y-0 active:scale-[0.98]
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-[#211E1A]/40 focus-visible:ring-offset-2
                        motion-reduce:transition-none
                        motion-reduce:hover:translate-y-0
                        max-sm:w-full max-sm:justify-center
                    "
                >
                    <Plus
                        size={18}
                        className="
                            transition-transform duration-300 ease-out
                            group-hover:rotate-90
                            motion-reduce:transition-none
                            motion-reduce:group-hover:rotate-0
                        "
                    />
                    Add Supervisor
                </button>
            </div>

            {/* SUMMARY */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                {[
                    ["Total", supervisors.length, UsersRound, "blue"],
                    ["Active", activeCount, UserCheck, "green"],
                    ["Inactive", supervisors.length - activeCount, UserX, "slate"],
                ].map(([label, value, Icon, tone], index) => (
                    <div
                        key={label}
                        className="rare-rise h-full min-w-0"
                        style={{ "--d": `${stagger(index + 1, 70)}ms` }}
                    >
                        <div
                            className="
                                group h-full cursor-default rounded-[18px]
                                border border-[#E7DED2] bg-[#FFFDFA]
                                p-3.5 shadow-[0_3px_14px_rgba(33,30,26,0.025)]
                                transition-all duration-300 ease-out
                                hover:-translate-y-1 hover:border-[#D9CCBA]
                                hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
                                motion-reduce:transition-none
                                motion-reduce:hover:translate-y-0
                                sm:rounded-[20px] sm:p-5
                            "
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 text-xs font-medium text-[#817669] sm:text-sm">
                                    {label}
                                </p>

                                <span
                                    className={`
                                        hidden shrink-0 rounded-xl p-2 min-[420px]:block sm:p-2.5
                                        transition-transform duration-300 ease-out
                                        group-hover:scale-110 group-hover:-rotate-6
                                        motion-reduce:transition-none
                                        motion-reduce:group-hover:transform-none
                                        ${tones[tone]}
                                    `}
                                >
                                    <Icon size={18} strokeWidth={1.8} />
                                </span>
                            </div>

                            <p className="mt-2 text-2xl font-bold leading-none tracking-tight tabular-nums text-[#211E1A] sm:mt-3 sm:text-[30px]">
                                <AnimatedNumber value={value} />
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* FILTERS */}
            <section
                className="rare-rise rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5"
                style={{ "--d": `${stagger(4, 70)}ms` }}
            >
                <div className="mb-4 flex items-center gap-3">
                    <span className={`rounded-xl p-2 ${tones.violet}`}>
                        <SlidersHorizontal size={17} strokeWidth={1.8} />
                    </span>
                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Search & Filter
                    </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_160px_180px_auto]">
                    <div className="group relative col-span-2 md:col-span-1">
                        <Search
                            size={18}
                            className="
                                pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2
                                text-[#938778] transition-colors duration-200
                                group-focus-within:text-[#211E1A]
                            "
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name, phone, email, username..."
                            aria-label="Search supervisors"
                            className="
                                h-12 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA]
                                pl-11 pr-4 text-sm text-[#211E1A] outline-none
                                transition-all duration-200
                                placeholder:text-[#AAA196]
                                hover:border-[#CFC4B5]
                                focus:border-[#211E1A]
                                focus:ring-4 focus:ring-[#211E1A]/10
                            "
                        />
                    </div>

                    <div className="relative min-w-0">
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            aria-label="Filter supervisor status"
                            className={selectClass}
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <ChevronDown
                            size={16}
                            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />
                    </div>

                    <div className="relative min-w-0">
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            aria-label="Sort supervisors"
                            className={selectClass}
                        >
                            <option value="name">Name A–Z</option>
                            <option value="name-desc">Name Z–A</option>
                            <option value="username">Username A–Z</option>
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                        </select>
                        <ChevronDown
                            size={16}
                            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setRefreshKey((key) => key + 1)}
                        aria-label="Refresh supervisors"
                        className="
                            group col-span-2 flex h-12 items-center justify-center gap-2
                            rounded-xl border border-[#E4DCCD] px-4
                            text-sm font-semibold text-[#211E1A]
                            transition-all duration-200 ease-out
                            hover:border-[#CFC4B5] hover:bg-[#F1EADF]
                            active:scale-[0.97]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211E1A]/30
                            md:col-span-1
                        "
                    >
                        <RefreshCw
                            size={18}
                            className={`
                                transition-transform duration-500 ease-out
                                group-hover:rotate-180
                                motion-reduce:transition-none
                                motion-reduce:group-hover:rotate-0
                                ${loading ? "animate-spin" : ""}
                            `}
                        />
                        <span className="md:hidden">Refresh</span>
                    </button>
                </div>
            </section>

            {/* ERROR */}
            {error && (
                <div
                    role="alert"
                    className="rare-rise rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            {/* DIRECTORY */}
            {!loading && !error && (
                <section className="space-y-3 sm:space-y-4">
                    <p className="rare-fade flex items-center gap-2 text-sm text-[#817669]">
                        <span className="rounded-full bg-[#F1EADF] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#211E1A]">
                            {visibleSupervisors.length}
                        </span>
                        {visibleSupervisors.length === 1
                            ? "Supervisor"
                            : "Supervisors"}{" "}
                        found
                    </p>

                    {visibleSupervisors.map((person, index) => {
                        const name = supervisorName(person);
                        const isActive = Boolean(person.is_active);

                        return (
                            <article
                                key={person.id}
                                className="
                                    rare-rise group rounded-[20px] border border-[#E7DED2]
                                    bg-[#FFFDFA] p-4
                                    transition-all duration-300 ease-out
                                    hover:-translate-y-0.5 hover:border-[#CFC1B0]
                                    hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
                                    motion-reduce:transition-none
                                    motion-reduce:hover:translate-y-0
                                    sm:rounded-[22px] sm:p-5
                                "
                                style={{ "--d": `${stagger(index, 50, 500)}ms` }}
                            >
                                <div className="flex items-start gap-3 sm:gap-4">
                                    <div
                                        className={`
                                            flex h-12 w-12 shrink-0 items-center justify-center
                                            rounded-full text-lg font-bold
                                            transition-transform duration-300 ease-out
                                            group-hover:scale-105
                                            motion-reduce:transition-none
                                            motion-reduce:group-hover:scale-100
                                            sm:h-14 sm:w-14
                                            ${avatarTone(name)}
                                        `}
                                    >
                                        {name.charAt(0).toUpperCase()}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                to={`/admin/supervisors/${person.id}`}
                                                className="
                                                    wrap-break-word rounded text-base font-bold
                                                    text-[#211E1A] transition-colors duration-200
                                                    hover:underline
                                                    focus-visible:outline-none focus-visible:ring-2
                                                    focus-visible:ring-[#211E1A]/30
                                                    sm:text-lg
                                                "
                                            >
                                                {name}
                                            </Link>

                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${isActive
                                                    ? "bg-[#E7F2E8] text-[#296F40]"
                                                    : "bg-[#EEE8E0] text-[#74695D]"
                                                    }`}
                                            >
                                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                                {isActive ? "ACTIVE" : "INACTIVE"}
                                            </span>
                                        </div>

                                        <p className="mt-1 break-all text-xs text-[#817669]">
                                            @{person.username || "No username"}
                                        </p>

                                        <div className="mt-3 grid gap-2 text-sm text-[#665E53] sm:grid-cols-2">
                                            <span className="flex min-w-0 items-center gap-2.5">
                                                <span className={`shrink-0 rounded-lg p-1.5 ${tones.green}`}>
                                                    <Phone size={14} />
                                                </span>
                                                <span className="min-w-0 break-all">
                                                    {person.phone || "Not provided"}
                                                </span>
                                            </span>

                                            <span className="flex min-w-0 items-center gap-2.5">
                                                <span className={`shrink-0 rounded-lg p-1.5 ${tones.orange}`}>
                                                    <Mail size={14} />
                                                </span>
                                                <span className="min-w-0 break-all">
                                                    {person.email || "Not provided"}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#F0E9DF] pt-4">
                                    <div className="flex gap-2">
                                        {person.phone && (
                                            <a
                                                href={`tel:${person.phone}`}
                                                className="
                                                    group/call inline-flex items-center gap-2 rounded-xl
                                                    bg-[#E7F2E8] px-3.5 py-2 text-xs font-semibold text-[#296F40]
                                                    transition-all duration-200 ease-out
                                                    hover:bg-[#D6EAD9]
                                                    hover:shadow-[0_6px_16px_rgba(41,111,64,0.15)]
                                                    active:scale-[0.97]
                                                    focus-visible:outline-none focus-visible:ring-2
                                                    focus-visible:ring-[#296F40]/40
                                                "
                                            >
                                                <Phone
                                                    size={15}
                                                    className="
                                                        transition-transform duration-300 ease-out
                                                        group-hover/call:-rotate-12 group-hover/call:scale-110
                                                        motion-reduce:transition-none
                                                        motion-reduce:group-hover/call:transform-none
                                                    "
                                                />
                                                Call
                                            </a>
                                        )}
                                    </div>

                                    <Link
                                        to={`/admin/supervisors/${person.id}`}
                                        className="
                                            group/view inline-flex items-center gap-2 rounded-lg
                                            px-1 py-0.5 text-sm font-semibold text-[#211E1A]
                                            focus-visible:outline-none focus-visible:ring-2
                                            focus-visible:ring-[#211E1A]/30
                                        "
                                    >
                                        View Details
                                        <ArrowUpRight
                                            size={18}
                                            className="
                                                transition-transform duration-300 ease-out
                                                group-hover/view:-translate-y-0.5 group-hover/view:translate-x-0.5
                                                motion-reduce:transition-none
                                                motion-reduce:group-hover/view:transform-none
                                            "
                                        />
                                    </Link>
                                </div>
                            </article>
                        );
                    })}

                    {!visibleSupervisors.length && (
                        <div className="rare-fade rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-12 text-center sm:py-14">
                            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${tones.blue}`}>
                                <UsersRound size={30} strokeWidth={1.6} />
                            </div>
                            <h3 className="mt-4 font-bold text-[#211E1A]">
                                No supervisors found
                            </h3>
                            <p className="mt-2 text-sm text-[#817669]">
                                Try a different search or status filter.
                            </p>
                        </div>
                    )}
                </section>
            )}

            <AddSupervisor
                open={showAddSupervisor}
                onClose={() => setShowAddSupervisor(false)}
                onCreated={() => {
                    // Refresh after the success modal closes.
                    setRefreshKey((key) => key + 1);
                }}
            />
        </div>
    );
}