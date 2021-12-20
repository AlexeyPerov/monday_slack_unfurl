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
const upload = multer();

// for parsing application/json
app.use(express.json());

// for parsing application/x-www-form-urlencoded
app.use(express.urlencoded({extended: true}));

// for parsing multipart/form-data
app.use(upload.array());
app.use(express.static('public'));

// An API for Slack
app.post("/monday-app-unfurl", async (req, res) => {
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
                onLinkShared(slack, event)
                    .then(r => res.status(200).send())
                    .catch(e => {
                        console.error(e);
                        res.status(500).send(e);
                    });
            } catch (e) {
                console.error(e);
                res.status(500).send(e);
                return;
            }


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

function onLinkShared(slack, event) {
    return Promise.allSettled(event.links.map(messageUnfurlFromLink))
        .then(results => {
            const filtered = results.filter(r => r.status === "fulfilled");
            return Promise.all(filtered.map(x => x.value)).then(x => keyBy(x, 'url'))
                .then(unfurls => mapValues(unfurls, x => omit(x, 'url')))
                .then(unfurls => {
                    const args = {
                        ts: event.message_ts,
                        channel: event.channel,
                        unfurls: unfurls
                    };

                    console.log('args: ' + JSON.stringify(args));

                    return slack.chat.unfurl(args).then(r => console.log(JSON.stringify(r)))
                        .catch(e => console.error("Error:\n" + JSON.stringify(e)));
                })
                .catch((e) => console.error(e));
        });
}

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
                                text: data.pulse
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'plain_text',
                                text: data.board
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
                                text: data.board
                            }
                        }
                    ],
                };
            }
        });
}

function getMondayUrlData(url) {
    return unfurlMondayLink(url).then(function(data) {
        return data;
    }).catch(e => {
        console.error(e);
        return null;
    });
}

// Parses strings like:
// https://domain.monday.com/boards/1802709835/views/37620753/pulses/1957128768
// https://domain.monday.com/boards/1802709835/views/37620753/pulses/1959492575?userId=10386480
async function unfurlMondayLink(link) {
    let board;
    let pulse;

    const boardStr = 'boards';
    const boardPos = link.indexOf(boardStr);

    if (boardPos === -1) {
        throw `Unable to find ${boardStr}`;
    }

    const linkPart = link.substring(boardPos + boardStr.length + 1);
    const boardEndPos = linkPart.indexOf('/');

    if (boardEndPos !== -1) {
        board = linkPart.substring(0, boardEndPos);
    } else {
        board = linkPart;
    }

    const pulsesStr = 'pulses';

    const pulsePos = linkPart.indexOf(pulsesStr);

    if (pulsePos !== -1) {
        const pulseLinkPart = linkPart.substring(pulsePos + pulsesStr.length + 1);
        const pulseBorderPos = pulseLinkPart.indexOf('?');

        if (pulseBorderPos !== -1) {
            pulse = pulseLinkPart.substring(0, pulseBorderPos);
        } else {
            pulse = pulseLinkPart;
        }
    }

    let boardOutput;
    let pulseOutput = '';

    const boardQuery = '{ boards(limit:1, ids:[' + board + '])'
        + ' { name } }';

    const boardResult = await fetchMondayQuery(boardQuery);
    const boardInfo = boardResult.data.boards[0];

    boardOutput = boardInfo.name;

    if (pulse != null && pulse.length > 0) {
        const pulseQuery = '{ items (ids: ' + pulse + ') { name } }';
        const pulseResult = await fetchMondayQuery(pulseQuery);

        if (pulseResult == null) {
            throw `Unable to find ${pulse} in monday`;
        }

        const itemInfo = pulseResult.data.items[0];

        if (itemInfo == null) {
            throw `Unable to find ${pulse} in monday`;
        }

        pulseOutput = itemInfo.name;
    }

    let result = new Unfurl()
    result.pulse = pulseOutput;
    result.board = boardOutput;

    return result;
}

async function fetchMondayQuery(query) {
    let response = await fetch('https://api.monday.com/v2', {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.MONDAY_TOKEN
        },
        body: JSON.stringify({
            'query': query
        })
    });

    if (!response.ok) {
        throw new Error('HTTP error, status: ' + response.status);
    } else {
        return await response.json();
    }
}

class Unfurl {
    board;
    pulse;
}

module.exports.handler = sls(app);