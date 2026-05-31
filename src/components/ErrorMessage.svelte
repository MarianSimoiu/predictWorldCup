<script>
    let { error = "", context = "" } = $props();

    let isDefaultDbMissing = $derived(
        error && (
            error.includes("(default)") ||
            error.includes("Database '(default)' not found") ||
            error.includes("not found") && error.toLowerCase().includes("database")
        )
    );
</script>

<div class="error-container">
    <div class="error-card">
        <div class="header">
            <span class="icon">⚠️</span>
            <h2>Connection Error</h2>
        </div>

        {#if context}
            <div class="context">{context}</div>
        {/if}

        <div class="message">
            <code>{error}</code>
        </div>

        {#if isDefaultDbMissing}
            <div class="guide-box">
                <h3>🛠️ Action Required: Enable Cloud Firestore</h3>
                <p>The application is running, but Firebase reports that your **Cloud Firestore** database has not been created yet for this project.</p>
                
                <ol class="steps">
                    <li>
                        Go to the 
                        <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">Firebase Console</a> 
                        and log in.
                    </li>
                    <li>Select your project: <strong class="highlight">predict2026-f98e8</strong>.</li>
                    <li>On the left sidebar, click on <strong class="highlight">Build &gt; Firestore Database</strong>.</li>
                    <li>Click the <strong class="highlight">Create database</strong> button at the top.</li>
                    <li>Choose your location (e.g., US or Europe) and click Next.</li>
                    <li>
                        Set the Security Rules to <strong>Start in test mode</strong> (or update them to allow read/write access), 
                        then click <strong>Create</strong>.
                    </li>
                </ol>

                <div class="note">
                    Once the database creation finishes (takes ~15 seconds), this screen will automatically load your matches or prompt you to sync them!
                </div>
            </div>
        {:else}
            <div class="help-box">
                <p>If you're configuring this database for the first time, please check your network connection, Firebase security rules, and database configuration.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .error-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 2rem;
        width: 100%;
        box-sizing: border-box;
        animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .error-card {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 100%);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 16px;
        padding: 2.5rem;
        max-width: 650px;
        width: 100%;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
        box-sizing: border-box;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.25rem;
    }

    .icon {
        font-size: 2.2rem;
        animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }

    h2 {
        margin: 0;
        font-size: 1.75rem;
        color: #ef4444;
        font-weight: 700;
        letter-spacing: -0.5px;
    }

    .context {
        font-size: 0.95rem;
        color: #aaa;
        margin-bottom: 1rem;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
    }

    .message {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 1rem 1.25rem;
        margin-bottom: 2rem;
        word-break: break-all;
    }

    .message code {
        font-family: 'Fira Code', 'Courier New', Courier, monospace;
        font-size: 0.9rem;
        color: #f87171;
    }

    .guide-box {
        background: rgba(251, 191, 36, 0.06);
        border: 1px solid rgba(251, 191, 36, 0.25);
        border-radius: 12px;
        padding: 1.5rem;
        margin-top: 1.5rem;
    }

    .guide-box h3 {
        margin: 0 0 1rem 0;
        color: #fbbf24;
        font-size: 1.15rem;
        font-weight: 600;
    }

    .guide-box p {
        margin: 0 0 1.25rem 0;
        font-size: 0.95rem;
        line-height: 1.6;
        color: #e2e8f0;
    }

    .steps {
        padding-left: 1.25rem;
        margin: 0;
    }

    .steps li {
        font-size: 0.95rem;
        line-height: 1.7;
        margin-bottom: 0.75rem;
        color: #cbd5e1;
    }

    .steps a {
        color: #38bdf8;
        text-decoration: underline;
        font-weight: 600;
        transition: color 0.2s;
    }

    .steps a:hover {
        color: #7dd3fc;
    }

    .highlight {
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.15);
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-family: monospace;
    }

    .note {
        margin-top: 1.25rem;
        font-size: 0.85rem;
        color: #94a3b8;
        font-style: italic;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 0.75rem;
    }

    .help-box {
        color: #94a3b8;
        font-size: 0.9rem;
        line-height: 1.5;
    }
</style>
