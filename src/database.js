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
CREATE OR REPLACE FUNCTION check_activities_array()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM unnest(NEW.activities) AS activity_id
        WHERE NOT EXISTS (SELECT 1 FROM activities WHERE id = activity_id)
    ) THEN
        RAISE EXCEPTION 'One or more IDs in the activities array do not exist in the activities table';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT,
    name TEXT,
    password TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    token TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id)
);


CREATE TABLE IF NOT EXISTS towns (
    id SERIAL PRIMARY KEY,
    name TEXT,
    coordinates TEXT
);


CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    town INTEGER,
    name TEXT,
    description TEXT,
    image TEXT,

    FOREIGN KEY (town) REFERENCES towns(id)
);


CREATE TABLE IF NOT EXISTS travels (
    id SERIAL PRIMARY KEY,
    name TEXT,
    description TEXT,
    town INTEGER,
    owner_id INTEGER,
    activities INTEGER[],
    public BOOLEAN,

    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (town) REFERENCES towns(id)
    -- FOREIGN KEY (activities) REFERENCES activities(id) -- replaced with trigger
);

-- CREATE TRIGGER activities_array_check
-- BEFORE INSERT OR UPDATE ON travels
-- FOR EACH ROW EXECUTE FUNCTION check_activities_array();


CREATE TABLE IF NOT EXISTS activity_comments (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER,
    activity_id INTEGER,
    title TEXT,
    pros TEXT,
    cons TEXT,
    text TEXT,
    stars INTEGER,

    FOREIGN KEY (owner_id) REFERENCES users(id), 
    FOREIGN KEY (activity_id) REFERENCES activities(id) 
);

CREATE TABLE IF NOT EXISTS travels_comments (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER,
    travel_id INTEGER,
    title TEXT,
    pros TEXT,
    cons TEXT,
    text TEXT,

    FOREIGN KEY (owner_id) REFERENCES users(id), 
    FOREIGN KEY (travel_id) REFERENCES travels(id) 
);
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

const travels = {
    getTowns: async function () {
        const towns = (await db.query("SELECT * FROM towns")).rows;
        return towns;
    },
    getRecommendations: async function (town = null) {
        if (town) {
            return (await db.query("SELECT * FROM travels WHERE public AND town = $1 LIMIT 10", [town])).rows;
        } else {
            return (await db.query("SELECT * FROM travels WHERE public LIMIT 10")).rows;
        }
    },
    getPublicTravel: async (id) => {
        const res = await db.query("SELECT * FROM travels WHERE id = $1 AND public LIMIT 1", [id]);
        if (res.rowCount <= 0) return null;
        const ret = res.rows[0];
        if (!ret.public) return null;
        return ret;
    },
    getTravel: async (id, userid) => {
        const res = (await db.query("SELECT * FROM travels WHERE id = $1 AND owner_id = $2 LIMIT 1", [id, userid]));
        if (res.rowCount <= 0) return null;
        else return res.rows[0];
    },
    getTown: async (town_id) => {
        return (await db.query("SELECT * FROM towns WHERE id = $1 LIMIT 1", [town_id])).rows[0];
    },
    getActivities: async (activities_ids) => {
        let res = [];
        for (let id of activities_ids) {
            res.push(
                (await db.query("SELECT * FROM activities WHERE id = $1 LIMIT 1", [id])).rows[0]
            )
        }
        return res;
    },
    getTravelComments: async (id) => {
        return (await db.query("SELECT * FROM travels_comments WHERE id = $1", [id])).rows;
    },
    getActivityComments: async (id) => {
        return (await db.query("SELECT * FROM activity_comments WHERE id = $1", [id])).rows;
    },
    getActivity: async (id) => {
        return (await db.query("SELECT * FROM activities WHERE id = $1 LIMIT 1", [id])).rows[0];
    }
};

export { db, login, register, checkSession, sessionParser, travels };