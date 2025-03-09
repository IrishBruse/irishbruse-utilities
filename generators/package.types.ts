export type Contributes = {
    configuration: Configuration;
    themes: Theme[];
    viewsContainers: ViewsContainers;
    views: ViewContainersViews;
    commands: Command[];
    menus: Menus;
};

export type Package = {
    displayName: string;
    name: string;
    description: string;
    contributes: Contributes;
};

export type Command = {
    command: string;
    title: string;
    shortTitle: string;
    icon?: string;
};

export type Configuration = {
    type: string;
    title: string;
    properties: Properties;
};

export type Properties = Record<string, ConfigurationProperty>;

export type ConfigurationProperty = {
    type: string;
    description: string;
    additionalProperties: AdditionalProperties;
    default: unknown;
};

export type AdditionalProperties = {
    type: string;
    description: string;
};

export type Menus = Record<string, Title[]>;

export type Title = {
    command: string;
    when: string;
    group: string;
};

export type Theme = {
    label: string;
    uiTheme: string;
    path: string;
};

export type ViewContainersViews = Record<string, View[]>;

export type View = {
    id: string;
    name: string;
};

export type ViewsContainers = {
    activitybar: Activitybar[];
    panel: Activitybar[];
};

export type Activitybar = {
    id: string;
    title: string;
    icon: string;
};
