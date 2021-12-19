require('dotenv').config();

const slackEventsAPI = require('@slack/events-api');
const { WebClient } = require('@slack/client');
const keyBy = require('lodash.keyby');
const omit = require('lodash.omit');
const mapValues = require('lodash.mapvalues');
const normalizePort = require('normalize-port');
const fetch = require('node-fetch');

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

const slackEvents = slackEventsAPI.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);

const slack = new WebClient(process.env.SLACK_CLIENT_TOKEN);

// https://api.slack.com/events/link_shared
slackEvents.on('link_shared', (event) => {
    onLinkShared(event);
});

function onLinkShared(event) {
    Promise.allSettled(event.links.map(messageUnfurlFromLink))
        .then(results => {
            const filtered = results.filter(r => r.status === "fulfilled");
            Promise.all(filtered.map(x => x.value)).then(x => keyBy(x, 'url'))
                .then(unfurls => mapValues(unfurls, x => omit(x, 'url')))
                .then(unfurls => chatUnfurl(event, unfurls))
                .catch(console.error);
        });

}

function chatUnfurl(event, unfurls) {
    // https://api.slack.com/methods/chat.unfurl
    slack.chat.unfurl(event.message_ts, event.channel, unfurls);
}

const slackEventsErrorCodes = slackEventsAPI.errorCodes;

slackEvents.on('error', (error) => {
    if (error.code === slackEventsErrorCodes.TOKEN_VERIFICATION_FAILURE) {
        console.warn(`An unverified request was sent to the Slack events request URL: ${error.body}`);
    } else {
        console.error(error);
    }
});

const port = normalizePort(process.env.PORT || '3000');
slackEvents.start(port).then(() => {
    console.log(`server listening on port ${port}`);
});

/*
// Testing code
const testEvent = {
    token: "XXYYZZ",
    team_id: "TXXXXXXXX",
    api_app_id: "AXXXXXXXXX",
    event: {
        type: "link_shared",
        channel: "Cxxxxxx",
        is_bot_user_member: true,
        user: "Uxxxxxxx",
        message_ts: "123456789.9875",
        unfurl_id: "C123456.123456789.987501.1b90fa1278528ce6e2f6c5c2bfa1abc9a41d57d02b29d173f40399c9ffdecf4b",
        thread_ts: "123456621.1855",
        source: "conversations_history",
        links: [
            {
                domain: "domain.monday.com",
                url: "https://domain.monday.com/boards/1802709835/views/37620753/pulses/1957128768"
            },
            {
                domain: "domain.monday.com",
                url: "https://domain.monday.com/boards/1802709835444"
            },
            {
                domain: "domain.monday.com",
                url: "https://domain.monday.com/boards/1802709835/views/37620753/pulses/1959492575?userId=10386480"
            },
            {
                domain: "domain.monday.com",
                url: "https://domain.monday.com/boards/1802709835"
            },
        ]
    },
    type: "event_callback",
    authed_users: [
        "UXXXXXXX1",
        "UXXXXXXX2"
    ],
    event_id: "Ev08MFMKH6",
    event_time: 123456789
};

onLinkShared(testEvent.event);
 */