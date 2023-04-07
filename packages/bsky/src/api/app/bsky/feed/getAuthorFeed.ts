import { Server } from '../../../../lexicon'
import { FeedKeyset, composeFeed } from '../util/feed'
import { paginate } from '../../../../db/pagination'
import AppContext from '../../../../context'
import { authOptionalVerifier } from '../util'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getAuthorFeed({
    auth: authOptionalVerifier,
    handler: async ({ params, auth }) => {
      const { actor, limit, cursor } = params
      const requester = auth.credentials.did
      const db = ctx.db.db
      const { ref } = db.dynamic

      const feedService = ctx.services.feed(ctx.db)

      let did = ''
      if (actor.startsWith('did:')) {
        did = actor
      } else {
        const actorRes = await db
          .selectFrom('actor')
          .select('did')
          .where('handle', '=', actor)
          .executeTakeFirst()
        if (actorRes) {
          did = actorRes?.did
        }
      }

      // @NOTE mutes applied on pds
      const postsQb = feedService.selectPostQb().where('post.creator', '=', did)

      const repostsQb = feedService
        .selectRepostQb()
        .where('repost.creator', '=', did)

      const keyset = new FeedKeyset(ref('cursor'), ref('postCid'))
      let feedItemsQb = db
        .selectFrom(postsQb.unionAll(repostsQb).as('feed_items'))
        .selectAll()
      feedItemsQb = paginate(feedItemsQb, {
        limit,
        cursor,
        keyset,
      })

      const feedItems = await feedItemsQb.execute()
      const feed = await composeFeed(feedService, feedItems, requester)

      return {
        encoding: 'application/json',
        body: {
          feed,
          cursor: keyset.packFromResult(feedItems),
        },
      }
    },
  })
}
