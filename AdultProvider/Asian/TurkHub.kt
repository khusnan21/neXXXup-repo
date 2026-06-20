package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import org.jsoup.nodes.Element

class TurkHub : MainAPI() {
    override var mainUrl = "https://turkhub.org"
    override var name = "TurkHub"
    override val hasMainPage = true
    override var lang = "tr"
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.NSFW)
    override val vpnStatus = VPNStatus.MightBeNeeded

    override val mainPage = mainPageOf(
        "$mainUrl/" to "Ana Sayfa",
        "$mainUrl/turk-ifsalar/" to "Türk İfşalar",
        "$mainUrl/turk-porno/" to "Türk Porno",
        "$mainUrl/turbanli-ifsalar/" to "Türbanlı İfşalar",
        "$mainUrl/populer-videolar/" to "Popüler Videolar",
        "$mainUrl/en-cok-izlenenler/" to "En Çok İzlenenler"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page <= 1) request.data else "${request.data}/page/$page/"
        val document = app.get(url).document
        val home = document.select("div.item").mapNotNull { it.toSearchResult() }
        return newHomePageResponse(request.name, home, hasNext = true)
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val title = selectFirst("div.title a")?.text() ?: return null
        val href = fixUrl(selectFirst("a")?.attr("href") ?: return null)
        val poster = fixUrlNull(selectFirst("img")?.attr("data-src") ?: selectFirst("img")?.attr("src"))

        return newMovieSearchResponse(title, href, TvType.NSFW) { this.posterUrl = poster }
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val url = if (page <= 1) "$mainUrl/?s=$query" else "$mainUrl/page/$page/?s=$query"
        val document = app.get(url).document
        val results = document.select("div.item").mapNotNull { it.toSearchResult() }
        return newSearchResponseList(results, true)
    }

    override suspend fun load(url: String): LoadResponse? {
        val document = app.get(url).document
        val title = document.selectFirst("h1")?.text()?.trim() ?: return null
        val poster = document.selectFirst("meta[property=og:image]")?.attr("content")
        val plot = document.selectFirst(".entry-content")?.text()?.trim()
        val tags = document.select(".tags a").map { it.text() }
        val actors = document.select(".models a").map { Actor(it.text()) }
        val recommendations = document.select("div.item").mapNotNull { it.toSearchResult() }

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
        val iframes = document.select("iframe")
        var found = false

        iframes.forEach { iframe ->
            val src = iframe.attr("src")
            if (src.isNotEmpty()) {
                val wasExtracted = loadExtractor(src, data, subtitleCallback, callback)
                if (wasExtracted) found = true
            }
        }
        return found
    }
}
