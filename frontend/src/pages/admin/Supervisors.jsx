import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";
import SearchFilterToolbar from "../../components/common/SearchFilterToolbar";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    ChevronDown,
    Mail,
    Phone,
    Plus,
    RefreshCw,
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
    blue: "bg-pastel-sky text-info",
    green: "bg-pastel-mint text-success",
    orange: "bg-pastel-blush text-warning",
    violet: "bg-pastel-lavender text-violet",
    slate: "bg-pastel-lavender text-muted",
};

// Avatar palette: each supervisor gets a stable colour from their name
const avatarTones = [
    "bg-pastel-sky text-info",
    "bg-pastel-mint text-success",
    "bg-pastel-blush text-warning",
    "bg-pastel-lavender text-violet",
    "bg-pastel-blush text-danger",
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
  border border-border bg-surface
  pl-4 pr-10 text-sm text-ink
  outline-none transition-all duration-200
  hover:border-border-strong
  focus:border-ink
  focus:ring-4 focus:ring-ink/10
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
        <div className="admin-supervisor-directory space-y-6 pb-6 sm:space-y-7">
            <style>{pageCss}</style>

            {loading && (
                <LoadingScreen message="Loading supervisors..." />
            )}

            {/* HEADING */}
            <div className="rare-fade flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                        Admin / Team Management
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                        Supervisors <span className="ml-2 hidden rounded-full bg-app px-3 py-1 align-middle text-sm font-semibold lg:inline-block">{loading ? "..." : supervisors.length}</span>
                    </h1>

                    <p className="mt-2 text-sm text-muted">
                        Manage accounts and project assignments.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAddSupervisor(true)}
                    className="
                        group inline-flex items-center gap-2 rounded-xl bg-ink
                        px-4 py-3 text-sm font-semibold text-white
                        shadow-[0_6px_18px_rgba(33,30,26,0.16)]
                        transition-all duration-200 ease-out
                        hover:-translate-y-0.5 hover:bg-primary-hover
                        hover:shadow-[0_12px_26px_rgba(33,30,26,0.24)]
                        active:translate-y-0 active:scale-[0.98]
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-ink/40 focus-visible:ring-offset-2
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
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:hidden">
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
                                border border-border bg-surface
                                p-3.5 shadow-[0_3px_14px_rgba(33,30,26,0.025)]
                                transition-all duration-300 ease-out
                                hover:-translate-y-1 hover:border-border-strong
                                hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
                                motion-reduce:transition-none
                                motion-reduce:hover:translate-y-0
                                sm:rounded-[20px] sm:p-5
                            "
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 text-xs font-medium text-muted sm:text-sm">
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

                            <p className="mt-2 text-2xl font-bold leading-none tracking-tight tabular-nums text-ink sm:mt-3 sm:text-[30px]">
                                <AnimatedNumber value={value} />
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden items-center gap-5 text-sm text-muted lg:flex"><span>Total <strong className="ml-1 text-ink">{loading ? "..." : supervisors.length}</strong></span><span aria-hidden="true" className="text-border-strong">|</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success" />Active <strong className="text-ink">{loading ? "..." : activeCount}</strong></span><span aria-hidden="true" className="text-border-strong">|</span><span>Inactive <strong className="ml-1 text-ink">{loading ? "..." : supervisors.length - activeCount}</strong></span></div>
            {/* FILTERS */}
            <section className="supervisor-directory-toolbar rare-rise" style={{ "--d": `${stagger(4, 70)}ms` }}>
                <SearchFilterToolbar
                    label="Supervisor search and filters"
                    search={<ProjectSearch compact query={search} delay={0} onSearch={setSearch} label="Search supervisors" labelClassName="sr-only" placeholder="Name, phone, email or username" suggestions={visibleSupervisors.map((person) => ({ id: person.id, name: supervisorName(person), context: person.username, to: `/admin/supervisors/${person.id}` }))} />}
                    activeCount={Number(status !== "all") + Number(sort !== "name")}
                    onClear={() => { setSearch(""); setStatus("all"); setSort("name"); }}
                    actions={<button type="button" onClick={() => setRefreshKey((key) => key + 1)} aria-label="Refresh supervisors" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-ink hover:bg-app focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><RefreshCw size={18} className={loading ? "animate-spin" : ""} aria-hidden="true" /></button>}
                >
                    <div className="grid gap-3">
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
                            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
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
                            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
                        />
                    </div>

                    </div>
                </SearchFilterToolbar>
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

            {!loading && !error && <section className="supervisor-desktop-table hidden overflow-hidden rounded-b-2xl border border-t-0 border-border bg-surface lg:block"><table className="w-full table-fixed text-left text-sm"><thead className="border-y border-border bg-surface-soft text-muted"><tr>{[["Supervisor", "28%"], ["Email", "27%"], ["Phone", "17%"], ["Status", "10%"], ["Actions", "18%"]].map(([label, width]) => <th key={label} scope="col" className="px-5 py-4 font-semibold" style={{ width }}>{label}</th>)}</tr></thead><tbody>{visibleSupervisors.map((person) => { const name = supervisorName(person); return <tr key={person.id} className="border-b border-border last:border-b-0 hover:bg-surface-soft"><td className="px-5 py-5"><div className="flex min-w-0 items-center gap-3"><span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ' + avatarTone(name)}>{name.charAt(0).toUpperCase()}</span><div className="min-w-0"><Link to={'/admin/supervisors/' + person.id} className="break-words text-base font-bold text-ink hover:underline">{name}</Link><p className="mt-1 break-all text-xs text-muted">@{person.username || "No username"}</p></div></div></td><td className="break-all px-5 py-5 text-muted">{person.email ? <a href={'mailto:' + person.email} className="hover:underline">{person.email}</a> : "Not provided"}</td><td className="break-words px-5 py-5 text-muted">{person.phone || "Not provided"}</td><td className="px-5 py-5"><span className="inline-flex items-center gap-2 text-xs"><span className={'h-2 w-2 shrink-0 rounded-full ' + (person.is_active ? 'bg-success' : 'bg-muted')} />{person.is_active ? "Active" : "Inactive"}</span></td><td className="px-5 py-5"><div className="flex items-center gap-3">{person.phone && <a href={'tel:' + person.phone} aria-label={'Call ' + name} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-success hover:bg-pastel-mint"><Phone size={16} /></a>}<Link to={'/admin/supervisors/' + person.id} className="inline-flex items-center gap-1 border-l border-border pl-3 text-xs font-semibold text-ink hover:underline">View details<ArrowUpRight size={15} /></Link></div></td></tr>; })}</tbody></table>{!visibleSupervisors.length && <p className="p-8 text-center text-sm text-muted">No supervisors match this search or status filter.</p>}<footer className="border-t border-border px-5 py-4 text-xs text-muted">{visibleSupervisors.length} {visibleSupervisors.length === 1 ? "supervisor" : "supervisors"}</footer></section>}
            {/* DIRECTORY */}
            {!loading && !error && (
                <section className="space-y-3 sm:space-y-4 lg:hidden">
                    <p className="rare-fade flex items-center gap-2 text-sm text-muted">
                        <span className="rounded-full bg-app px-2.5 py-0.5 text-xs font-bold tabular-nums text-ink">
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
                                    rare-rise group rounded-[20px] border border-border
                                    bg-surface p-4
                                    transition-all duration-300 ease-out
                                    hover:-translate-y-0.5 hover:border-border-strong
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
                                                    text-ink transition-colors duration-200
                                                    hover:underline
                                                    focus-visible:outline-none focus-visible:ring-2
                                                    focus-visible:ring-ink/30
                                                    sm:text-lg
                                                "
                                            >
                                                {name}
                                            </Link>

                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${isActive
                                                    ? "bg-pastel-mint text-success"
                                                    : "bg-border text-muted"
                                                    }`}
                                            >
                                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                                {isActive ? "ACTIVE" : "INACTIVE"}
                                            </span>
                                        </div>

                                        <p className="mt-1 break-all text-xs text-muted">
                                            @{person.username || "No username"}
                                        </p>

                                        <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
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

                                <div className="mt-4 flex items-center justify-between gap-3 border-t border-surface-soft pt-4">
                                    <div className="flex gap-2">
                                        {person.phone && (
                                            <a
                                                href={`tel:${person.phone}`}
                                                className="
                                                    group/call inline-flex items-center gap-2 rounded-xl
                                                    bg-pastel-mint px-3.5 py-2 text-xs font-semibold text-success
                                                    transition-all duration-200 ease-out
                                                    hover:bg-pastel-mint
                                                    hover:shadow-[0_6px_16px_rgba(41,111,64,0.15)]
                                                    active:scale-[0.97]
                                                    focus-visible:outline-none focus-visible:ring-2
                                                    focus-visible:ring-success/40
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
                                            px-1 py-0.5 text-sm font-semibold text-ink
                                            focus-visible:outline-none focus-visible:ring-2
                                            focus-visible:ring-ink/30
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
                        <div className="rare-fade rounded-[22px] border border-border bg-surface px-5 py-12 text-center sm:py-14">
                            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${tones.blue}`}>
                                <UsersRound size={30} strokeWidth={1.6} />
                            </div>
                            <h3 className="mt-4 font-bold text-ink">
                                No supervisors found
                            </h3>
                            <p className="mt-2 text-sm text-muted">
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