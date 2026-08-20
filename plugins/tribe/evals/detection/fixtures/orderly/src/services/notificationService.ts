// module: src/services/notificationService
import type { Clock } from '../clock';
import type { Order } from '../types';

export function createNotificationService(deps: { clock: Clock }) {
  return {
    sendOrderConfirmation(order: Order): { sentAtUtc: string } {
      // DEVIATION (C1): throws across the service boundary instead of returning a Result.
      if (!order.customerId) {
        throw new Error('cannot notify: order has no customer');
      }
      return { sentAtUtc: deps.clock.nowUtc() };
    },
  };
}
