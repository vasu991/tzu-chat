import axios from "axios";
import { useContext, useState } from "react";
import { UserContext } from "./UserContext.jsx";

export function RegisterAndLoginForm() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoginOrRegister, setIsLoginOrRegister] = useState('login');
    const [error, setError] = useState('');
    const {setUsername:setLoggedInUsername, setId} = useContext(UserContext);
    
    async function handleSubmit(ev) {
        ev.preventDefault();
        setError('');
        try {
            const url = isLoginOrRegister === 'register' ? '/api/register' : '/api/login';
            const {data} = await axios.post(url, {username, password});
            setLoggedInUsername(username);
            setId(data.id);
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error) {
                setError(err.response.data.error);
            } else {
                setError('An unexpected error occurred. Please try again.');
            }
        }
    }
    
    return (
        <div className="bg-slate-100 h-screen flex items-center">
            <form className="w-60 mx-auto mb-12" onSubmit={handleSubmit}>
                <input value={username}
                onChange={ev => setUsername(ev.target.value)}
                type="text" placeholder="username" className="block w-full rounded-sm p-2 mb-2 border"/>
                <input
                value={password}
                onChange={ev => setPassword(ev.target.value)}
                type="password"
                placeholder="password" className="block w-full rounded-sm p-2 mb-2 border"/>
                <button className=" bg-blue-500 text-white block w-full rounded-sm p-2">{isLoginOrRegister === 'register'? 'Register' : 'Login'}</button>
                {error && (
                    <div className="text-red-500 text-sm text-center mt-2">
                        {error}
                    </div>
                )}
                <div className="text-center mt-2">
                    {isLoginOrRegister === 'register' && (
                        <div>
                            Already a Member? <button type="button" onClick={() => {setIsLoginOrRegister('login'); setError('');}}>Login Here</button>
                        </div>
                    )}
                    {isLoginOrRegister === 'login' && (
                        <div>
                            Don't have an account? <button type="button" onClick={() => {setIsLoginOrRegister('register'); setError('');}}>Register</button>
                        </div>
                    )}

                </div>
            </form>
        </div>
    );
}
