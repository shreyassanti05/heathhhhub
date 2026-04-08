export const registerUser = async (email: string) => {
    try {
        await fetch('http://localhost:5000/api/register-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
    } catch (error) {
        console.error('Failed to register user for notifications', error);
    }
};

export const logUserActivity = async (email: string, activityType: 'food', details: any) => {
    try {
        await fetch('http://localhost:5000/api/log-food', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, details }),
        });
    } catch (error) {
        console.error('Failed to log user activity', error);
    }
};
