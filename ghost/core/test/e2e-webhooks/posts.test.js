const {agentProvider, mockManager, fixtureManager, matchers} = require('../utils/e2e-framework');
const {anyGhostAgent, anyObjectId, anyISODateTime, anyUuid, anyContentVersion, anyNumber, anyLocalURL} = matchers;

const tierSnapshot = {
    id: anyObjectId,
    created_at: anyISODateTime,
    updated_at: anyISODateTime
};

const buildAuthorSnapshot = (roles = true) => {
    const authorSnapshot = {
        last_seen: anyISODateTime,
        created_at: anyISODateTime,
        updated_at: anyISODateTime
    };

    if (roles) {
        authorSnapshot.roles = new Array(1).fill({
            id: anyObjectId,
            created_at: anyISODateTime,
            updated_at: anyISODateTime
        });
    }

    return authorSnapshot;
};

const buildPostSnapshotWithTiers = ({published, tiersCount, roles = true}) => {
    return {
        id: anyObjectId,
        uuid: anyUuid,
        comment_id: anyObjectId,
        published_at: published ? anyISODateTime : null,
        created_at: anyISODateTime,
        updated_at: anyISODateTime,
        url: anyLocalURL,
        tiers: new Array(tiersCount).fill(tierSnapshot),
        primary_author: buildAuthorSnapshot(roles),
        authors: new Array(1).fill(buildAuthorSnapshot(roles))
    };
};

const buildPreviousPostSnapshotWithTiers = ({tiersCount}) => {
    return {
        updated_at: anyISODateTime,
        tiers: new Array(tiersCount).fill(tierSnapshot)
    };
};

describe('post.* events', function () {
    let adminAPIAgent;
    let webhookMockReceiver;

    before(async function () {
        adminAPIAgent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('integrations');
        await adminAPIAgent.loginAsOwner();
    });

    beforeEach(function () {
        webhookMockReceiver = mockManager.mockWebhookRequests();
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('post.published event is triggered', async function () {
        const webhookURL = 'https://test-webhook-receiver.com/post-published/';
        await webhookMockReceiver.mock(webhookURL);
        await fixtureManager.insertWebhook({
            event: 'post.published',
            url: webhookURL
        });

        const res = await adminAPIAgent
            .post('posts/')
            .body({
                posts: [{
                    title: 'webhookz',
                    status: 'draft',
                    mobiledoc: fixtureManager.get('posts', 1).mobiledoc
                }]
            })
            .expectStatus(201);

        const id = res.body.posts[0].id;
        const updatedPost = res.body.posts[0];
        updatedPost.status = 'published';

        await adminAPIAgent
            .put('posts/' + id)
            .body({
                posts: [updatedPost]
            })
            .expectStatus(200);

        await webhookMockReceiver.receivedRequest();

        webhookMockReceiver
            .matchHeaderSnapshot({
                'content-version': anyContentVersion,
                'content-length': anyNumber,
                'user-agent': anyGhostAgent
            })
            .matchBodySnapshot({
                post: {
                    current: buildPostSnapshotWithTiers({
                        published: true,
                        tiersCount: 2
                    }),
                    previous: buildPreviousPostSnapshotWithTiers({
                        tiersCount: 2
                    })
                }
            });
    });

    it('post.added event is triggered', async function () {
        const webhookURL = 'https://test-webhook-receiver.com/post-added/';
        await webhookMockReceiver.mock(webhookURL);
        await fixtureManager.insertWebhook({
            event: 'post.added',
            url: webhookURL
        });

        await adminAPIAgent
            .post('posts/')
            .body({
                posts: [{
                    title: 'testing post.added webhook',
                    status: 'draft'
                }]
            })
            .expectStatus(201);

        await webhookMockReceiver.receivedRequest();

        webhookMockReceiver
            .matchHeaderSnapshot({
                'content-version': anyContentVersion,
                'content-length': anyNumber,
                'user-agent': anyGhostAgent
            })
            .matchBodySnapshot({
                post: {
                    current: buildPostSnapshotWithTiers({
                        published: false,
                        tiersCount: 2,
                        // @NOTE: post.added event does not include post author's roles
                        //        see commit message for more context
                        roles: false
                    })
                }
            });
    });
});
