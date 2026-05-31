<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { auth } from '../lib/firebase.js';
    import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
    import { push } from 'svelte-spa-router';

    let isLogin = $state(true);
    let email = $state('');
    let password = $state('');
    let displayName = $state('');
    let errorMsg = $state('');

    async function handleSubmit(e) {
        e.preventDefault();
        errorMsg = '';
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName });
                // We will create the user doc in Firestore later
            }
            push('/dashboard');
        } catch (err) {
            errorMsg = err.message;
        }
    }
</script>

<div class="auth-container">
    <div class="auth-card">
        <h1>{isLogin ? 'Welcome Back!' : 'Join Predict26'}</h1>
        
        {#if errorMsg}
            <div class="error">{errorMsg}</div>
        {/if}

        <form onsubmit={handleSubmit}>
            {#if !isLogin}
                <div class="form-group">
                    <label for="name">Display Name</label>
                    <input type="text" id="name" bind:value={displayName} required={!isLogin} placeholder="Cool Predictor 99" />
                </div>
            {/if}
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" bind:value={email} required placeholder="you@company.com" />
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" bind:value={password} required placeholder="••••••••" />
            </div>
            <button type="submit" class="submit-btn">
                {isLogin ? 'Log In' : 'Sign Up'}
            </button>
        </form>

        <p class="toggle-text">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button class="toggle-btn" onclick={() => isLogin = !isLogin}>
                {isLogin ? 'Sign up here' : 'Log in here'}
            </button>
        </p>
    </div>
</div>

<style>
    .auth-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 80px);
    }
    .auth-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        padding: 2rem;
        border-radius: 12px;
        width: 100%;
        max-width: 400px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h1 {
        text-align: center;
        margin-bottom: 1.5rem;
        color: var(--color-primary);
    }
    .form-group {
        margin-bottom: 1rem;
    }
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    input {
        width: 100%;
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.2);
        color: white;
        box-sizing: border-box;
    }
    input:focus {
        outline: none;
        border-color: var(--color-primary);
    }
    .submit-btn {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 6px;
        background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
        color: white;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        margin-top: 1rem;
        transition: transform 0.1s;
    }
    .submit-btn:active {
        transform: scale(0.98);
    }
    .error {
        background: rgba(255, 77, 77, 0.2);
        color: #ff4d4d;
        padding: 0.75rem;
        border-radius: 6px;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }
    .toggle-text {
        text-align: center;
        margin-top: 1.5rem;
        font-size: 0.9rem;
    }
    .toggle-btn {
        background: none;
        border: none;
        color: var(--color-primary);
        cursor: pointer;
        font-weight: bold;
        text-decoration: underline;
    }
</style>
