import { Building2, CalendarDays, CalendarCheck2, MapPin, UserRound, UsersRound } from "lucide-react";
import InfoCard, { InfoField } from "../common/InfoCard";
import { ProjectStatus } from "./ProjectStatus";
import { projectDate } from "./projectPresentation";

export default function ProjectInformationCard({ project, supervisorCount, endDateHint, className = "" }) {
    return <InfoCard title="Project Information" eyebrow="At a glance" icon={Building2}
        aside={<ProjectStatus status={project.status} />} className={`rare-project-information ${className}`}>
        <dl className="rare-info-grid">
            <InfoField label="Client" value={project.client_name} icon={UserRound} />
            <InfoField label="Category" value={`${project.category_name || "Not specified"}${project.category_is_active === false ? " (inactive)" : ""}`} icon={Building2} />
            <InfoField label="Start date" value={projectDate(project.start_date)} icon={CalendarDays} />
            <InfoField label="Expected completion" value={<>{projectDate(project.end_date)}{endDateHint && <span className="rare-info-hint">{endDateHint}</span>}</>} icon={CalendarCheck2} />
            <InfoField label="Location" value={project.location} icon={MapPin} />
            {supervisorCount != null && <InfoField label="Supervisors" value={`${supervisorCount} assigned`} icon={UsersRound} />}
        </dl>
    </InfoCard>;
}
