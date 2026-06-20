package com.lagradost.cloudstream3.AdultProvider.Western

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import org.jsoup.nodes.Element
import android.util.Base64

class ThotDeep : MainAPI() {
    override var mainUrl = "https://thotdeep.com"
    override var name = "ThotDeep"
    override val hasMainPage = true
    override var lang = "en"
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.NSFW)
    override val vpnStatus = VPNStatus.MightBeNeeded

    override val mainPage = mainPageOf(
        "$mainUrl/videos/" to "Latest Videos",
        "$mainUrl/trending-videos/" to "Trending Videos",
        "$mainUrl/popular-videos/" to "Popular Videos",
        "$mainUrl/top-rated-videos/" to "Top Rated Videos",
        "$mainUrl/celebrities/" to "Celebrities"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page <= 1) request.data else "${request.data}/page/$page/"
        val document = app.get(url).document
        val home = document.select("div.item").mapNotNull { it.toSearchResult() }
        return newHomePageResponse(request.name, home, hasNext = true)
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val title = selectFirst("div.title a, div.name a")?.text() ?: return null
        val href = fixUrl(selectFirst("a")?.attr("href") ?: return null)
        val poster = fixUrlNull(selectFirst("img")?.attr("data-src") ?: selectFirst("img")?.attr("src"))

        return newMovieSearchResponse(title, href, TvType.NSFW) { this.posterUrl = poster }
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val url = if (page <= 1) "$mainUrl/search/videos/$query/" else "$mainUrl/search/videos/$query/page/$page/"
        val document = app.get(url).document
        val results = document.select("div.item").mapNotNull { it.toSearchResult() }
        return newSearchResponseList(results, true)
    }

    override suspend fun load(url: String): LoadResponse? {
        val document = app.get(url).document
        val title = document.selectFirst("h1")?.text()?.trim() ?: return null
        val poster = document.selectFirst("meta[property=og:image]")?.attr("content")
        val plot = document.selectFirst(".description")?.text()?.trim()
        val tags = document.select(".tags a").map { it.text() }
        val actors = document.select(".models a").map { Actor(it.text()) }
        val recommendations = document.select("div.item").mapNotNull { it.toSearchResult() }

        if (url.contains("/celebrities/")) {
            return newMovieLoadResponse(title, url, TvType.NSFW, url) {
                this.posterUrl = poster
                this.plot = plot
                this.tags = tags
                this.recommendations = recommendations
                addActors(actors)
            }
        }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = poster
            this.plot = plot
            this.tags = tags
            this.recommendations = recommendations
            addActors(actors)
        }
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        val document = app.get(data).document
        val player = document.selectFirst("div.player") ?: return false
        val encoded = player.attr("data-vid") ?: return false
        val decoded = String(Base64.decode(encoded, Base64.DEFAULT))

        if (decoded.isNotEmpty()) {
            callback.invoke(
                newExtractorLink(
                    source = name,
                    name = name,
                    url = decoded,
                    type = ExtractorLinkType.VIDEO
                ) {
                    this.referer = mainUrl
                    this.quality = Qualities.Unknown.value
                }
            )
        }
        return true
    }
}
