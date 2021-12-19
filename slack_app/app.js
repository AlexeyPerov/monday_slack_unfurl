'use strict';

require('dotenv').config();

const { WebClient } = require('@slack/client');
const keyBy = require('lodash.keyby');
const omit = require('lodash.omit');
const mapValues = require('lodash.mapvalues');
const fetch = require('node-fetch');

const token = process.env.SLACK_VERIFICATION_TOKEN,
    accessToken = process.env.SLACK_CLIENT_TOKEN;

const sls = require('serverless-http');

const express = require('express');
const app = express();

const multer = require('multer');
const {ChatUnfurlArguments} = require("@slack/web-api/dist/methods");
const upload = multer();

// for parsing application/json
app.use(express.json());

// for parsing application/x-www-form-urlencoded
app.use(express.urlencoded({extended: true}));

// for parsing multipart/form-data
app.use(upload.array());
app.use(express.static('public'));

// An API call to create a new pulse
app.post("/monday-app-unfurl", async (req, res) => {
    console.log('started');

    if (!req.body) {
        return res.sendStatus(400);
    }

    try {
        const payload = req.body;

        // verify necessary tokens are set in environment variables
        if (!token || !accessToken) {
            res.status(500).send('Tokens not set');
            return;
        }

        // Verification Token validation to make sure that the request comes from Slack
        if (token && token !== payload.token) {
            res.status(401).send('Auth failed');
            return;
        }

        console.log('type: ' + payload.type);

        if (payload.type === "event_callback") {
            const slack = new WebClient(accessToken);
            const event = payload.event;

            console.log(event);

            try {
                onLinkShared(slack, event);
            } catch (e) {
                console.error(e);
                res.status(500).send(e);
                return;
            }

            res.status(200).send();
        }
        // challenge sent by Slack when you first configure Events API
        else if (payload.type === "url_verification") {
            console.log('verification');
            res.status(200).send(payload.challenge);
        } else {
            console.error("An unknown event type received.");
            res.status(200).send("Unknown event type received.");
        }
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
});

function messageUnfurlFromLink(link) {
    return getMondayUrlData(link.url)
        .then((data) => {
            if (!data || (!data.board && !data.pulse)) {
                throw 'Unable to retrieve link data';
            }

            if (data.pulse) {
                return {
                    url: link.url,
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: data.pulse,
                                emoji: true
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'plain_text',
                                text: data.board,
                                emoji: true
                            }
                        }
                    ],
                };
            } else {
                return {
                    url: link.url,
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: data.board,
                                emoji: true
                            }
                        }
                    ],
                };
            }
        });
}

function getMondayUrlData(url) {
    const finalUrl = process.env.API_URL + url;
    return fetch(finalUrl).then(function(response) {
        return response.json();
    }).then(function(data) {
        return data;
    }).catch(e => {
        console.error(e);
        return null;
    });
}

function onLinkShared(slack, event) {
    Promise.allSettled(event.links.map(messageUnfurlFromLink))
        .then(results => {
            const filtered = results.filter(r => r.status === "fulfilled");
            Promise.all(filtered.map(x => x.value)).then(x => keyBy(x, 'url'))
                .then(unfurls => mapValues(unfurls, x => omit(x, 'url')))
                //.then(unfurls => console.log(JSON.stringify(unfurls))) // test
                .then(unfurls => {
                    const args = {
                        ts: event.message_ts,
                        channel: event.channel,
                        unfurls: unfurls
                    };

                    console.log('args: ' + JSON.stringify(args));

                    return slack.chat.unfurl(args).then(r => console.log(JSON.stringify(r)))
                        .catch(e => console.log(e));
                })
                .catch((e) => console.error(e));
        });

}

module.exports.handler = sls(app);