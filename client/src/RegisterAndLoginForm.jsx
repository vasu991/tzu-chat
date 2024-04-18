import axios from "axios";
import { useContext, useState } from "react";
import { UserContext } from "./UserContext.jsx";

export function RegisterAndLoginForm() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoginOrRegister, setIsLoginOrRegister] = useState('register');
    const {setUsername:setLoggedInUsername, setId} = useContext(UserContext);
    async function handleSubmit(ev) {
        ev.preventDefault();
        const url = isLoginOrRegister ? 'register' : 'login';
        try {
            const {data} = await axios.post(url, {username, password});
            setLoggedInUsername(username);
            setId(data.id);
        } catch (error) {
            console.log(error);
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
                <button className=" bg-blue-500 text-white block w-full rounded-sm">{isLoginOrRegister === 'register'? 'Register' : 'Login'}</button>
                <div className="text-center mt-2">
                    {isLoginOrRegister === 'register' && (
                        <div>
                            Already a Member? <button onClick={() => setIsLoginOrRegister('login')}>Login Here</button>
                        </div>
                    )}
                    {isLoginOrRegister === 'login' && (
                        <div>
                            Dont have an account? <button onClick={() => setIsLoginOrRegister('register')}>Register</button>
                        </div>
                    )}

                </div>
            </form>
        </div>
    );
}
