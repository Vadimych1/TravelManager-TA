import express from 'express';
import pug from 'pug';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { db, login, register, sessionParser, travels } from './src/database.js';

dotenv.config();

const app = express();
app.set('trust proxy', true)

const params = {
    appname: "Travel Manager",
};

// static files
app.use(express.static(path.join('static')));

// pug engine
app.engine('pug', pug.__express);
app.set('view engine', 'pug');

// other
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(sessionParser);

function requireAuth(req, res) {
    const { session } = req.cookies;

    if (!session) {
        res.redirect("/auth/login");
        return false;
    }

    return true;
}

// routes
app.get('/', (req, res) => {
    res.render('index', {
        ...params,
        user: res.user
    });
});

app.get("/auth/*", (req, res, next) => {
    const { session } = req.cookies;

    if (session) {
        res.redirect("/");
        return;
    }

    next();
});

app.get("/auth/login", (req, res) => {
    res.render("auth/login", {
        ...params
    });
});

app.get("/auth/register", (req, res) => {
    res.render("auth/register", {
        ...params
    });
});

app.get("/auth", (req, res) => {
    res.redirect("/auth/login", {
        ...params
    });
});

app.get("/profile", (req, res) => {
    if (requireAuth(req, res))
    res.render("profile/index", {
        ...params
    });
});

app.get("/travels/comments", async (req, res) => {
    const id = req.query.id;
    const type = req.query.type;

    if (!id || !type) {
        res.end();
    }

    let p = {
        ...params,
        comments: type == "travel" ? await travels.getTravelComments(id) : travels.getActivityComments(id),
        travel: type == "travel" ? await travels.getPublicTravel(id) : await travels.getActivity(id),
    }

    p.travel.town = await travels.getTown(p.travel.town);

    if (requireAuth(req, res))
    res.render("travels/comments", p);
});

app.get("/travels/new", async (req, res) => {
    if (requireAuth(req, res))
    res.render("travels/new", {
        ...params,
        towns: await travels.getTowns(),
    });
});

app.get("/travels/view", async (req, res) => {
    if (!requireAuth(req, res)) return;

    const t_id = req.query.id;
    let t = await travels.getPublicTravel(t_id);

    if (!t) {
        t = await travels.getTravel(t_id, req.session?.user_id);
    }

    if (t) {
        t.town = await travels.getTown(t.town); 
        t.activities = await travels.getActivities(t.activities);
    }

    res.render("travels/view", {
        ...params,
        travel: t,
    });
});

app.get("/travels", async (req, res) => {
    requireAuth(req, res);
    res.render("travels/index", {
        ...params,
        recommendations: await travels.getRecommendations(),
    });
});

// api
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const token = await login(email, password);

    if (!token) {
        return res.status(401).render("auth/login", {
            ...params,
            error: "Неверный логин или пароль",
        });
    }

    res.cookie("session", token, {
        httpOnly: true,
        secure: true
    });

    res.redirect("/");
});

app.post("/api/auth/register", async (req, res) => {
    const { email, name, password } = req.body;

    const token = await register(email, name, password);

    if (!token) {
        return res.status(401).render("auth/register", {
            ...params,
            error: "Пользователь с такой почтой уже существует",
        });
    }

    res.cookie("session", token, {
        httpOnly: true,
        secure: true
    });

    res.redirect("/");
});

// Start
app.listen(3000, () => {
    console.log("Server started on port 3000");
});