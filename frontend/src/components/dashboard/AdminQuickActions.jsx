
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
    FolderPlus,
    UserRoundPlus,
    ClipboardCheck,
    Clock3,
} from "lucide-react";

import AddProject from "../../modal/admin/AddProject";
import AddSupervisor from "../../modal/admin/AddSupervisor";

// =====================================================
// QUICK ACTIONS
// =====================================================

const quickActions = [
    {
        label: "Add Project",
        action: "add-project",
        icon: FolderPlus,
        tile: "bg-pastel-sky text-info group-hover:bg-info",
        ring: "focus-visible:ring-info/40",
    },
    {
        label: "Add Supervisor",
        action: "add-supervisor",
        icon: UserRoundPlus,
        tile: "bg-pastel-mint text-success group-hover:bg-success",
        ring: "focus-visible:ring-success/40",
    },
    {
        label: "Approvals",
        path: "/admin/approvals",
        icon: ClipboardCheck,
        tile: "bg-pastel-blush text-warning group-hover:bg-warning",
        ring: "focus-visible:ring-warning/40",
    },
    {
        label: "Delay Reports",
        path: "/admin/delays",
        icon: Clock3,
        tile: "bg-pastel-blush text-danger group-hover:bg-danger",
        ring: "focus-visible:ring-danger/40",
    },
];

// =====================================================
// ADMIN QUICK ACTIONS
// =====================================================

export default function AdminQuickActions() {
    const navigate = useNavigate();

    const [showAddProject, setShowAddProject] =
        useState(false);

    const [showAddSupervisor, setShowAddSupervisor] =
        useState(false);

    const handleProjectCreated = (project) => {
        setShowAddProject(false);
        navigate(`/admin/projects/${project.id}`);
    };

    const handleSupervisorCreated = (supervisor) => {
        // Keep the modal open so the Admin can see
        // the account creation confirmation.
        // A future Supervisor management page can
        // use this callback to refresh its listing.
        console.info(
            "Supervisor account created:",
            supervisor.id
        );
    };

    return (
        <>
            <section
                className="
          rounded-[22px]
          border border-pastel-lavender
          bg-surface
          px-4 py-5
          sm:px-6
        "
            >
                <h2 className="mb-4 text-base font-bold text-ink sm:mb-5">
                    Quick Actions
                </h2>

                <Link to="/admin/approvals" className="admin-primary-approval hidden items-center gap-3 rounded-xl border border-[#CDE5D9] bg-[#EFF9F3] p-4 lg:flex"><span className="rounded-full bg-white p-2 text-[#16845B]"><ClipboardCheck size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open approvals</span><span className="mt-1 block text-xs text-muted">Recent items waiting for an Admin decision.</span></span><span aria-hidden="true">&rarr;</span></Link>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
                    {quickActions.map((action) => {
                        const Icon = action.icon;

                        const content = (
                            <>
                                <span
                                    className={`
                    flex h-14 w-14 items-center justify-center
                    rounded-full
                    transition-all duration-200 ease-out
                    group-hover:text-white
                    group-hover:shadow-[0_8px_20px_rgba(33,30,26,0.12)]
                    sm:h-16 sm:w-16
                    ${action.tile}
                  `}
                                >
                                    <Icon
                                        size={23}
                                        strokeWidth={1.8}
                                        className="
                      transition-transform duration-200 ease-out
                      group-hover:scale-110
                      motion-reduce:transition-none
                      motion-reduce:group-hover:scale-100
                    "
                                    />
                                </span>

                                <span
                                    className="
                    text-xs font-medium text-muted
                    transition-colors duration-200
                    group-hover:text-ink
                    sm:text-sm
                  "
                                >
                                    {action.label}
                                </span>
                            </>
                        );

                        const className = `
              group flex flex-col items-center justify-center
              gap-2.5 rounded-2xl px-2 py-3
              text-center
              transition-all duration-200 ease-out
              hover:-translate-y-0.5
              active:scale-[0.98]
              focus-visible:outline-none
              focus-visible:ring-2
              motion-reduce:transition-none
              motion-reduce:hover:translate-y-0
              sm:py-4
              hover:cursor-pointer
              ${action.ring}
            `;

                        if (action.action === "add-project") {
                            return (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => setShowAddProject(true)}
                                    className={className}
                                >
                                    {content}
                                </button>
                            );
                        }

                        if (action.action === "add-supervisor") {
                            return (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => setShowAddSupervisor(true)}
                                    className={className}
                                >
                                    {content}
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={action.label}
                                to={action.path}
                                className={className}
                            >
                                {content}
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* ADD PROJECT MODAL */}
            <AddProject
                open={showAddProject}
                onClose={() => setShowAddProject(false)}
                onCreated={handleProjectCreated}
            />

            {/* ADD SUPERVISOR MODAL */}
            <AddSupervisor
                open={showAddSupervisor}
                onClose={() => setShowAddSupervisor(false)}
                onCreated={handleSupervisorCreated}
            />
        </>
    );
}
