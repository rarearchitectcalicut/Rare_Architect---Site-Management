import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import AddProject from "../../modal/admin/AddProject";
import AddSupervisor from "../../modal/admin/AddSupervisor";
import { ContentCard, PageHeader } from "../../components/common/WorkspaceUI";

/** Deep links reuse the exact production forms and their existing validators. */
export default function CreateRecord({ kind }) {
    const navigate = useNavigate();
    const project = kind === "project";
    const destination = project ? "/admin/projects" : "/admin/supervisors";
    const close = useCallback(() => navigate(destination, { replace: true }), [navigate, destination]);
    const createdProject = useCallback((created) => navigate(`/admin/projects/${created.id}`, { replace: true }), [navigate]);
    return <div className="space-y-4">
        <PageHeader eyebrow="Admin workspace" title={project ? "Create project" : "Add Supervisor"}
            description={project ? "Set up the project, schedule and cover image." : "Create a Supervisor account for your site team."} />
        <ContentCard><Link to={destination} className="rare-button rare-button-secondary">Back to {project ? "projects" : "Supervisors"}</Link></ContentCard>
        {project ? <AddProject open onClose={close} onCreated={createdProject} /> : <AddSupervisor open onClose={close} />}
    </div>;
}
