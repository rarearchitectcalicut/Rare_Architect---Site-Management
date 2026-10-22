
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
    FolderPlus,
    UserRoundPlus,
    ClipboardCheck,
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
        tile: "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB]",
        ring: "focus-visible:ring-[#2563EB]/40",
    },
    {
        label: "Add Supervisor",
        action: "add-supervisor",
        icon: UserRoundPlus,
        tile: "bg-[#E6F4EA] text-[#16A34A] group-hover:bg-[#16A34A]",
        ring: "focus-visible:ring-[#16A34A]/40",
    },
    {
        label: "Approvals",
        path: "/admin/approvals",
        icon: ClipboardCheck,
        tile: "bg-[#FFF3E0] text-[#EA8A12] group-hover:bg-[#EA8A12]",
        ring: "focus-visible:ring-[#EA8A12]/40",
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
          border border-[#e8dfd3]
          bg-[#fffdfa]
          px-4 py-5
          sm:px-6
        "
            >
                <h2 className="mb-4 text-base font-bold text-[#211e1a] sm:mb-5">
                    Quick Actions
                </h2>

                <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
                    text-xs font-medium text-[#665e53]
                    transition-colors duration-200
                    group-hover:text-[#211e1a]
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
