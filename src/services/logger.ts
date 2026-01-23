// ===================================
// Logger Service - Centralized Application Logging
// ===================================

import { info, warn, error, attachConsole } from '@tauri-apps/plugin-log';

// Initialize console attachment in development
if (import.meta.env.DEV) {
    attachConsole().catch(console.error);
}

export const logger = {
    info: async (message: string, context?: Record<string, any>) => {
        try {
            await info(formatLog(message, context));
        } catch (err) {
            console.error('Failed to log info:', err);
        }
    },

    warn: async (message: string, context?: Record<string, any>) => {
        try {
            await warn(formatLog(message, context));
        } catch (err) {
            console.error('Failed to log warn:', err);
        }
    },

    error: async (message: string, errorObj?: any, context?: Record<string, any>) => {
        try {
            const errorDetails = errorObj instanceof Error
                ? `${errorObj.message}\n${errorObj.stack}`
                : JSON.stringify(errorObj);

            await error(formatLog(`${message} | Error: ${errorDetails}`, context));
        } catch (err) {
            console.error('Failed to log error:', err);
        }
    }
};

function formatLog(message: string, context?: Record<string, any>): string {
    if (!context) return message;
    return `${message} | Context: ${JSON.stringify(context)}`;
}

// Global error handler
export const initGlobalErrorHandling = async () => {
    window.addEventListener('error', (event) => {
        logger.error('Uncaught Exception', event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
        logger.error('Unhandled Rejection', event.reason);
    });

    await logger.info('Application Logger Initialized');
};
