/**
 * Global toast system — callable from anywhere (hooks, services, components).
 *
 * Usage:
 *   import { toast } from '../services/toast';
 *   toast.error('Something failed');
 *   toast.success('Done!');
 *   toast.info('FYI...');
 *
 * App.tsx calls toast.subscribe() to receive messages and render ToastContainer.
 */

type ToastType = 'error' | 'success' | 'info';
interface ToastMessage { message: string; type: ToastType }

type Listener = (msg: ToastMessage) => void;
const listeners = new Set<Listener>();

function emit(message: string, type: ToastType) {
  for (const fn of listeners) fn({ message, type });
}

export const toast = {
  error(message: string) { emit(message, 'error'); },
  success(message: string) { emit(message, 'success'); },
  info(message: string) { emit(message, 'info'); },
  /** Subscribe to toast events. Returns unsubscribe function. */
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
