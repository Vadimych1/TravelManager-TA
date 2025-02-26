import express from 'express';
import pug from 'pug';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import muliparty from 'multiparty';
import fs from 'fs';
import JSZip from "jszip";
import tokml from 'tokml';
import contentDisposition from 'content-disposition';
import {create} from 'xmlbuilder2';
import { db, login, register, sessionParser, travels, renameAccount, logout, deleteAccount } from './src/database.js';

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
    const { user } = res;

    if (!user) {
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
    const { user } = res;

    if (user) {
        res.redirect("/");
        return;
    }

    next();
});

app.get("/auth/login", (req, res) => {
    res.render("auth/login", {
        ...params,
        user: res.user
    });
});

app.get("/auth/register", (req, res) => {
    res.render("auth/register", {
        ...params,
        user: res.user
    });
});

app.get("/auth", (req, res) => {
    res.redirect("/auth/login", {
        ...params,
        user: res.user
    });
});

app.get("/profile", async (req, res) => {
    if (!requireAuth(req, res)) return;

    let private_travels = await travels.getPrivateTravels(res.user.id);
    let public_travels = await travels.getPublicTravels(res.user.id);
    let moderated_travels = await travels.getModeratedTravels(res.user.id);

    for (let i = 0; i < private_travels.length; i++) {
        private_travels[i].town = await travels.getTown(private_travels[i].town);
    }

    for (let i = 0; i < public_travels.length; i++) {
        public_travels[i].town = await travels.getTown(public_travels[i].town);
    }

    for (let i = 0; i < moderated_travels.length; i++) {
        moderated_travels[i].town = await travels.getTown(moderated_travels[i].town);
    }

    res.render("profile/index", {
        ...params,
        user: res.user,
        private_travels,
        public_travels,
        moderated_travels,
        comments,
    });
});

app.get("/travels/comments", async (req, res) => {
    const id = req.query.id;
    const type = req.query.type;

    let comments = type == "travel" ? await travels.getTravelComments(id) : await travels.getActivityComments(id);

    for (let i = 0; i < comments.length; i++) {
        comments[i].user= (await travels.getUsername(comments[i].owner_id));
    }

    let p = {
        ...params,
        comments,
        travel: type == "travel" ? await travels.getPublicTravel(id) : await travels.getActivity(id),
        user: res.user,
        type,
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
        user: res.user
    });
});

app.get("/travels/view", async (req, res) => {
    const t_id = req.query.id;
    let t = await travels.getPublicTravel(t_id);

    if (res.user != null && !t) {
        t = await travels.getTravel(t_id, res.user.id);
    }

    if (t) {
        t.town = await travels.getTown(t.town); 
        t.activities = await travels.getActivities(t.activities);
    }

    res.render("travels/view", {
        ...params,
        travel: t,
        user: res.user
    });
});

app.get("/travels", async (req, res) => {
    res.render("travels/index", {
        ...params,
        recommendations: await travels.getRecommendations(),
        user: res.user
    });
});


app.get("/admins", async (req, res) => {
    if (!requireAuth(req, res)) return;

    let moderated_travels = await travels.getAllModeratedTravels();

    for (let i = 0; i < moderated_travels.length; i++) {
        moderated_travels[i].town = await travels.getTown(moderated_travels[i].town);
    }

    res.render("admins/index", {
        ...params,
        user: res.user,
        towns: await travels.getTowns(),
        moderated_travels
    });
});

app.get("/admins/view", async (req, res) => {
    if (!requireAuth(req, res)) return;

    let travel = await travels.getModeratedTravel(req.query.id);

    if (travel) {
        travel.town = await travels.getTown(travel.town);
        travel.activities = await travels.getActivities(travel.activities);
    }

    res.render("admins/view", {
        ...params,
        user: res.user,
        travel
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

app.post("/api/auth/rename", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
    await renameAccount(res.user.id, req.body.name);
    res.redirect("/profile");
});

app.post("/api/auth/delete", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
    await deleteAccount(res.user.id);
    res.cookie("session", "", { maxAge: 0 });
    res.redirect("/auth");
})

app.post("/api/auth/logout", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
    await logout(res.user.token);
    res.cookie("session", "", { maxAge: 0 });
    res.redirect("/auth");
})

app.post("/api/auth/avatar",  async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
    
    let form = new muliparty.Form();
    form.parse(req, (e, fields, files) => {
        let avatar = files["avatar"];

        if (avatar) {
            fs.copyFileSync(avatar[0].path, `static/profiles/${res.user.id}.png`);
        }
    });

    res.redirect("/profile");
});


app.get("/api/travels/get_activities", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
    const town = req.query.town;
    res.send(await travels.getActivitiesByTown(town));
});

app.post("/api/travels/create", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"})
    const { name, description, town, is_public, activity } = req.body;

    await travels.sendTravelToModetation(name, description, town, res.user.id, is_public, activity);

    res.redirect("/profile")
});

app.get("/api/admins/approve", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"})
    await travels.approveTravel(req.query.id);
    res.redirect("/admins");
});

app.get("/api/admins/delete", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"})
    await travels.rejectTravel(req.query.id);
    res.redirect("/admins");
});

app.post("/api/travels/add_town", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"})
    await travels.addTown(req.body.name, req.body.coordinates);
    res.redirect("/admins");
});

app.post("/api/travels/add_activity", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"})
    let form = new muliparty.Form();
    form.parse(req, (e, fields, files) => {
        travels.addActivity(fields.name[0], fields.description[0], fields.town[0], fields.coordinates[0]).then((r) => {
            let f = files["image"];
            if (f) {
                fs.copyFileSync(f[0].path, `static/activities/${r}.png`);
            }
        });
    });
    
    res.redirect("/admins");
});

app.post("/api/travels/add_comment", async (req, res) => {
    if (!requireAuth(req, res)) res.send({"status": "not_authorized"});

    if (req.query.type == "travel") {
        await travels.addTravelComment(req.query.id, res.user.id, req.body.text, req.body.pros, req.body.cons);
    } else {
        await travels.addActivityComment(req.query.id, res.user.id, req.body.text, req.body.pros, req.body.cons);
    }

    res.redirect("/travels/comments?id=" + req.query.id + "&type=" + req.query.type);
});


app.get("/api/download/kml", async (req, res) => {
    let t = await travels.getPublicTravel(req.query.id);
    if (!t) {
        if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
        t = await travels.getTravel(req.query.id, res.user.id);
    }

    if (!t) {
        res.send({"status": "not_found"});
        return;
    }

    let activities = await travels.getActivities(t.activities);
    let features = [];

    for (let i = 0; i < activities.length; i++) {
        let activity = activities[i];
        let coordinates = JSON.parse("["+activity.coordinates+"]");
        let feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [coordinates[1], coordinates[0]]
            },
            "properties": {
                "name": activity.name,
                "description": activity.description
            }
        }
        features.push(feature);
    }

    const geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    const kml = tokml(geojson);
    res.set("Content-Disposition", contentDisposition(`${t.name}.kml`));
    res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
    res.send(kml);
});

app.get("/api/download/kmz", async (req, res) => {
    let zip = new JSZip();
    let t = await travels.getPublicTravel(req.query.id);
    if (!t) {
        if (!requireAuth(req, res)) res.send({"status": "not_authorized"});
        t = await travels.getTravel(req.query.id, res.user.id);
    }

    if (!t) {
        res.send({"status": "not_found"});
        return;
    }

    let activities = await travels.getActivities(t.activities);
    let features = [];

    for (let i = 0; i < activities.length; i++) {
        let activity = activities[i];
        let coordinates = JSON.parse("["+activity.coordinates+"]");
        let feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [coordinates[1], coordinates[0]]
            },
            "properties": {
                "name": activity.name,
                "description": activity.description + `\n<img src="activities/${activity.id}.png"/>`,
                "icon": `activities/${activity.id}.png`,
            }
        }
        if (fs.existsSync(`static/activities/${activity.id}.png`)) {
            const image = fs.readFileSync(`static/activities/${activity.id}.png`);
            zip = zip.file(`activities/${activity.id}.png`, image);
            feature.properties.icon = `activities/${activity.id}.png`;
        }
        features.push(feature);
    }

    const geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    const kml = tokml(geojson);
    zip = zip.file("travel.kml", kml);

    const content = await zip.generateAsync({type:"nodebuffer"});
    res.setHeader("Content-Type", "application/vnd.google-earth.kmz");
    res.set("Content-Disposition", contentDisposition(`${t.name}.kmz`));
    res.send(content);
});

app.get("/api/download/gpx", async (req, res) => {
    let activitiy = await travels.getActivity(req.query.id);
    const gpxData = {
        gpx: {
            '@version': '1.1',
            '@creator': 'Travel Manager GPX Generator',
            '@xmlns': 'http://www.topografix.com/GPX/1/1',
            wpt: {
                '@lat': JSON.parse("["+activitiy.coordinates+"]")[0],
                '@lon': JSON.parse("["+activitiy.coordinates+"]")[1],
                name: activitiy.name,
                desc: activitiy.description
            }
        }
    };
    
    const gpx = create(gpxData).end({ prettyPrint: true });

    res.setHeader("Content-Type", "application/gpx");
    res.set("Content-Disposition", contentDisposition(`${activitiy.name}.gpx`));
    res.send(gpx);
});

// Start
app.listen(3000, () => {
    console.log("[INFO] Server started on port 3000");
});