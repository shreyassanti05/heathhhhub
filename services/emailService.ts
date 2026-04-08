
interface EmailData {
    to: string;
    subject: string;
    text: string;
    html: string;
}

export const sendDailyReport = async (email: string, stats: { intake: number; burned: number; net: number; date: string; foods: { name: string; calories: number; }[] }) => {
    // No API key needed here; it's on the server

    const foodListHtml = stats.foods.length > 0
        ? `<ul style="color: #555;">${stats.foods.map(f => `<li>${f.name} - <strong>${f.calories} kcal</strong></li>`).join('')}</ul>`
        : '<p style="color: #777;">No foods logged today.</p>';

    const data = {
        to: email,
        subject: `Daily Health Report - ${stats.date}`,
        text: `Here is your daily health report for ${stats.date}.\n\nCalories Consumed: ${stats.intake} kcal\nCalories Burned: ${stats.burned} kcal\nNet Calories: ${stats.net} kcal\n\nFoods Consumed:\n${stats.foods.map(f => `- ${f.name} (${f.calories} kcal)`).join('\n')}\n\nKeep up the great work!`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                <h2 style="color: #2c3e50;">Daily Health Report</h2>
                <p style="color: #7f8c8d;">Date: ${stats.date}</p>
                <hr style="border: 0; border-top: 1px solid #eee;" />
                <div style="margin: 20px 0;">
                    <p><strong>Calories Consumed:</strong> <span style="color: #27ae60;">${stats.intake} kcal</span></p>
                    <p><strong>Calories Burned:</strong> <span style="color: #e67e22;">${stats.burned} kcal</span></p>
                    <p><strong>Net Calories:</strong> <span style="color: #2980b9;">${stats.net} kcal</span></p>
                </div>
                
                <h3 style="color: #2c3e50; margin-top: 30px;">Activity Summary</h3>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px;">
                     <h4 style="margin-top: 0; color: #16a085;">Foods Consumed</h4>
                     ${foodListHtml}
                </div>

                <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
                <p style="font-size: 12px; color: #999;">Sent from Health Hub AI</p>
            </div>
        `
    };

    try {
        const response = await fetch("http://localhost:5000/api/send-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to send email");
        }

        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
};
