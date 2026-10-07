import type { Connector } from "../types";

// The prototype marks 6 of the 20 as on; the sidebar shows that count.
export const CONNECTORS: Connector[] = [
  { id: "outlook", name: "Outlook", maker: "Microsoft 365", category: "Email and calendar", icon: "mail", does: "Reads and drafts email, and checks your calendar.", state: "off" },
  { id: "teams", name: "Microsoft Teams", maker: "Microsoft 365", category: "Chat and meetings", icon: "videoCall", does: "Reads the chats and channels you pick, and meeting transcripts.", state: "off" },
  { id: "onedrive", name: "OneDrive and SharePoint", maker: "Microsoft 365", category: "Files", icon: "folder", does: "Finds and reads files in the folders you choose.", state: "off" },
  { id: "gmail", name: "Gmail", maker: "Google Workspace", category: "Email", icon: "mail", does: "Reads and drafts email.", state: "connected" },
  { id: "gdrive", name: "Google Drive", maker: "Google Workspace", category: "Files", icon: "folderOpen", does: "Finds and reads files in the folders you choose.", state: "connected" },
  { id: "gcal", name: "Google Calendar", maker: "Google Workspace", category: "Calendar", icon: "calendar", does: "Checks when people are free and adds events.", state: "connected" },
  { id: "zoom", name: "Zoom", maker: "Zoom Communications", category: "Meetings", icon: "videoCall", does: "Reads meeting recordings and transcripts to write notes and follow-ups.", state: "connected" },
  { id: "slack", name: "Slack", maker: "Salesforce", category: "Chat", icon: "messages", does: "Reads the channels you pick and sums up threads.", state: "connected" },
  { id: "dropbox", name: "Dropbox", maker: "Dropbox", category: "Files", icon: "archive", does: "Finds and reads files in the folders you choose.", state: "off" },
  { id: "github", name: "GitHub", maker: "GitHub", category: "Code", icon: "code", does: "Reads code, pull requests and issues, and leaves review comments.", state: "off" },
  { id: "notion", name: "Notion", maker: "Notion Labs", category: "Docs and notes", icon: "note", does: "Reads pages and databases, and drafts edits.", state: "off" },
  { id: "salesforce", name: "Salesforce", maker: "Salesforce", category: "CRM", icon: "users", does: "Reads accounts, deals and contacts.", state: "off" },
  { id: "hubspot", name: "HubSpot", maker: "HubSpot", category: "CRM and marketing", icon: "target", does: "Reads contacts, deals and email history.", state: "off" },
  { id: "jira", name: "Jira", maker: "Atlassian", category: "Project tracking", icon: "kanban", does: "Reads tickets and sprints, and drafts new tickets and updates.", state: "off" },
  { id: "confluence", name: "Confluence", maker: "Atlassian", category: "Docs and notes", icon: "book", does: "Reads your team's pages and drafts new ones.", state: "off" },
  { id: "docusign", name: "Docusign", maker: "Docusign", category: "E-signature", icon: "signature", does: "Checks where each agreement stands and prepares envelopes.", state: "connected" },
  { id: "box", name: "Box", maker: "Box", category: "Files", icon: "folderPlus", does: "Finds and reads files in the folders you choose.", state: "off" },
  { id: "asana", name: "Asana", maker: "Asana", category: "Project tracking", icon: "checklist", does: "Reads projects and tasks, and drafts updates and new tasks.", state: "off" },
  { id: "quickbooks", name: "QuickBooks", maker: "Intuit", category: "Accounting", icon: "receipt", does: "Reads invoices, bills and reports, and drafts entries.", state: "off" },
  { id: "zoho", name: "Zoho", maker: "Zoho", category: "CRM, mail and books", icon: "building", does: "Reads CRM records, invoices and mail, and drafts changes.", state: "off" },
];
