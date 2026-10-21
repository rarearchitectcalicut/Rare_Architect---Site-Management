
import {
    Bell,
    ClipboardList,
    ClockAlert,
    FileText,
    Files,
    FolderKanban,
    History,
    House,
    LayoutDashboard,
    ShieldCheck,
    UsersRound,
} from "lucide-react";

const icons = {
    Bell,
    ClipboardList,
    ClockAlert,
    FileText,
    Files,
    FolderKanban,
    History,
    House,
    LayoutDashboard,
    ShieldCheck,
    UsersRound,
};

export default function NavIcon({
    name,
    size = 20,
    className = "",
}) {
    const Icon = icons[name] || LayoutDashboard;

    return (
        <Icon
            size={size}
            strokeWidth={1.9}
            className={className}
            aria-hidden="true"
        />
    );
}
