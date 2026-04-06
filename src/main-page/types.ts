import { TFile } from 'obsidian';

export interface TaskData {
    id: string;
    name: string;
    status: string;
    deadline: string;
    path: string;
    priority: number;
    tags: string[];
    linkedProject?: string;
    responsible?: string;
}

export interface ProjectData {
    id: string;
    name: string;
    status: string;
    path: string;
    goal: string;
    priority?: number;
    started?: string;
    target_date?: string;
    responsible?: string;
    tracked_emails?: string[];
}

export interface IncidentData {
    id: string;
    name: string;
    status: string;
    date: string;
    path: string;
    sender: string;
}

export interface SimpleNoteData {
    id: string;
    name: string;
    path: string;
    created: string;
    tags: string[];
    author?: string;
}

export interface VaultData {
    incidents: IncidentData[];
    tasks: TaskData[];
    projects: ProjectData[];
    notes: SimpleNoteData[];
}

export interface FilterData {
    name: string;
    tags: string[];
}
