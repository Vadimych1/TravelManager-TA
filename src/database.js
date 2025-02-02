import pg from 'pg';
const { Client } = pg;
import bcrypt from 'bcrypt';

const db = new Client({
    user: 'postgres',
    // password: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'travel_manager'
});
await db.connect();

await db.query(`
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT,
    name TEXT,
    password TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    token TEXT
);

ALTER TABLE sessions
ADD FOREIGN KEY (user_id) REFERENCES users(id);
`);

function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function login(email, password) {
    const user = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    if (!user) {
        return null;
    }

    if (!bcrypt.compareSync(password, user.password)) {
        return null;
    }

    const token = generateToken();
    await db.query("INSERT INTO sessions (user_id, token) VALUES ($1, $2)", [user.id, token]);

    return token;
}

async function register(email, name, password) {
    const user = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    if (user) {
        return null;
    }

    await db.query("INSERT INTO users (email, name, password) VALUES ($1, $2, $3)", [email, name, bcrypt.hashSync(password, 10)]);
    const userId = (await db.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
    const token = generateToken();

    await db.query("INSERT INTO sessions (user_id, token) VALUES ($1, $2)", [userId, token]);

    return token;
}

async function checkSession(token) {
    const session = (await db.query("SELECT * FROM sessions WHERE token = $1", [token])).rows[0];
    if (!session) {
        return null;
    }

    const user = (await db.query("SELECT * FROM users WHERE id = $1", [session.user_id])).rows[0];
    if (!user) {
        return null;
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

async function sessionParser(req, res, next) {
    const { session } = req.cookies;
    const user = await checkSession(session);

    res.user = user;
    next();
}

export { db, login, register, checkSession, sessionParser };