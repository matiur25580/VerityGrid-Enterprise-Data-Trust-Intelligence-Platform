export type IncidentNotification = { organizationId: string; incidentId: string; severity: string };
export interface NotificationProvider { incidentCreated(event: IncidentNotification): Promise<{ delivered: boolean; provider: string }> }
/** Safe default: notifications are intentionally disabled until an organization configures a provider. */
export const notificationProvider: NotificationProvider = {
  async incidentCreated(_event) {
    return { delivered: false, provider: "disabled" };
  },
};
