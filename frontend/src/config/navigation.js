
export function getDashboardPath(role) {
    return role === "ADMIN"
        ? "/admin/dashboard"
        : "/supervisor/dashboard";
}

export function getNavigation(role) {
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";

    const items = [
        {
            label: "Dashboard",
            icon: "LayoutDashboard",
            path: `${prefix}/dashboard`,
        },
        {
            label: "Projects",
            icon: "FolderKanban",
            path: `${prefix}/projects`,
        },
        {
            label: "Tasks",
            icon: "ClipboardList",
            path: `${prefix}/tasks`,
        },
        {
            label: "Daily Reports",
            icon: "FileText",
            path: `${prefix}/reports`,
        },
        {
            label: "Documents",
            icon: "Files",
            path: `${prefix}/documents`,
        },
        {
            label: "Delays",
            icon: "ClockAlert",
            path: `${prefix}/delays`,
        },
        {
            label: "Notifications",
            icon: "Bell",
            path: `${prefix}/notifications`,
        },
    ];

    if (role === "ADMIN") {
        items.splice(3, 0, {
            label: "Approvals",
            icon: "ShieldCheck",
            path: `${prefix}/approvals`,
        });

        items.splice(4, 0, {
            label: "Supervisors",
            icon: "UsersRound",
            path: `${prefix}/supervisors`,
        });

        items.push({
            label: "Activity Logs",
            icon: "History",
            path: `${prefix}/activity`,
        });
    }

    return items;
}

export function getMobilePrimaryNavigation(role) {
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";

    return [
        {
            label: "Home",
            icon: "House",
            path: `${prefix}/dashboard`,
        },
        {
            label: "Projects",
            icon: "FolderKanban",
            path: `${prefix}/projects`,
        },
        {
            label: "Tasks",
            icon: "ClipboardList",
            path: `${prefix}/tasks`,
        },
        {
            label: "Alerts",
            icon: "Bell",
            path: `${prefix}/notifications`,
        },
    ];
}
