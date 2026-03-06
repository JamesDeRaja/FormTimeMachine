export type DomFingerprint = {
  title: string;
  inputCount: number;
  textareaCount: number;
  selectCount: number;
  contentEditableCount: number;
};

export type CapturedField = {
  key: string;
  tag: string;
  type?: string;
  selector?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  labelText?: string;
  domPath?: string;
  value?: string;
  checked?: boolean;
  selectedValues?: string[];
  textContent?: string;
};

export type PageSnapshot = {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  pageTitle: string;
  url: string;
  origin: string;
  path: string;
  hostname: string;
  scrollX: number;
  scrollY: number;
  domFingerprint: DomFingerprint;
  fields: CapturedField[];
};

export type RestoreReport = {
  totalFields: number;
  restoredCount: number;
  skippedCount: number;
  missingCount: number;
  warnings: string[];
};

export type StorageShape = {
  snapshots: PageSnapshot[];
};

export type ActivePageContext = {
  tabId: number;
  title: string;
  url: string;
  origin: string;
  path: string;
  hostname: string;
};

export type PopupState = {
  currentTab?: ActivePageContext;
  snapshots: PageSnapshot[];
  filteredSnapshots: PageSnapshot[];
  isSaving: boolean;
  activeRestoreId?: string;
  searchQuery: string;
  selectedTag?: string | null;
  status?: { type: "info" | "success" | "warning" | "error"; message: string };
};
