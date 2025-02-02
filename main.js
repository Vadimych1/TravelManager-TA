import express from 'express';
import pug from 'pug';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { login, register, sessionParser } from './src/database.js';

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
    res.redirect("/auth/login");
})

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
