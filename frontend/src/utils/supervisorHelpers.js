
export function getItems(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    throw new Error("Unexpected API list response.");
}

export function supervisorName(supervisor) {
    const name = [
        supervisor?.first_name,
        supervisor?.last_name,
    ].filter(Boolean).join(" ").trim();

    return name ||
        supervisor?.name ||
        supervisor?.username ||
        "Unnamed Supervisor";
}

export function formatAccountDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

export function getApiError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    return fallback;
}

export function getFieldErrors(error) {
    const data = error?.response?.data;
    const fields = [
        "first_name",
        "last_name",
        "username",
        "phone",
        "email",
        "is_active",
    ];

    const errors = {};

    for (const field of fields) {
        if (!data?.[field]) continue;

        errors[field] = Array.isArray(data[field])
            ? data[field].join(" ")
            : String(data[field]);
    }

    return errors;
}
