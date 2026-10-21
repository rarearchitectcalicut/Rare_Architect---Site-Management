import { Link } from "react-router-dom";
import {
    FolderPlus,
    UserRoundPlus,
    ClipboardCheck,
} from "lucide-react";

// Full class strings are written out literally so Tailwind can detect them.
const quickActions = [
    {
        label: "Add Project",
        path: "/admin/projects/new",
        icon: FolderPlus,
        // Soft Blue
        tile: "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB]",
        ring: "focus-visible:ring-[#2563EB]/40",
    },
    {
        label: "Add Supervisor",
        path: "/admin/supervisors/new",
        icon: UserRoundPlus,
        // Soft Green
        tile: "bg-[#E6F4EA] text-[#16A34A] group-hover:bg-[#16A34A]",
        ring: "focus-visible:ring-[#16A34A]/40",
    },
    {
        label: "Approvals",
        path: "/admin/approvals",
        icon: ClipboardCheck,
        // Soft Orange
        tile: "bg-[#FFF3E0] text-[#EA8A12] group-hover:bg-[#EA8A12]",
        ring: "focus-visible:ring-[#EA8A12]/40",
    },
];

export default function AdminQuickActions() {
    return (
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

            {/* Equal-width columns on every screen size, so items spread
          across the full card instead of bunching to the left */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {quickActions.map((action) => {
                    const Icon = action.icon;

                    return (
                        <Link
                            key={action.label}
                            to={action.path}
                            className={`
                group flex flex-col items-center justify-center
                gap-2.5 rounded-2xl px-2 py-3
                text-center
                transition-all duration-200 ease-out
                hover:-translate-y-0.5
                active:scale-[0.98]
                focus-visible:outline-none focus-visible:ring-2
                motion-reduce:transition-none
                motion-reduce:hover:translate-y-0
                sm:py-4
                ${action.ring}
              `}
                        >
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
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}