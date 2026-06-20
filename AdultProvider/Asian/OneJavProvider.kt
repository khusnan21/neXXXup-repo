package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import org.jsoup.nodes.Element

class OneJavProvider : MainAPI() {
    override var mainUrl = "https://onejav.com"
    override var name = "OneJav"
    override val hasMainPage = true
    override var lang = "ja"
    override val supportedTypes = setOf(TvType.NSFW)

    override val mainPage = mainPageOf(
        "new" to "New",
        "popular" to "Popular",
        "tag/FC2" to "FC2",
        "tag/JavPlayer" to "JavPlayer",
        "random" to "Random",
        "actress" to "Actresses"
    )

    override suspend fun getMainPage(
        page: Int,
        request: MainPageRequest
    ): HomePageResponse {
        val data = request.data
        val cleanData = if (data.endsWith("/") || data.contains("?")) data else "$data/"
        val url = if (page <= 1) {
            "$mainUrl/$cleanData"
        } else {
            if (cleanData.contains("?")) {
                "$mainUrl/$cleanData&page=$page"
            } else {
                "$mainUrl/$cleanData?page=$page"
            }
        }
        val document = app.get(url).document
        val home = document.select("div.card").mapNotNull {
            it.toSearchResult()
        }
        return newHomePageResponse(request.name, home, hasNext = true)
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val href = selectFirst("h5.title a, h5.card-header a")?.attr("href")
            ?: selectFirst("a[href*=/actress/]")?.attr("href")
            ?: return null

        val title = selectFirst("h5.title a, h5.card-header a")?.text()
            ?: selectFirst("p.card-header-title")?.let { p ->
                val own = p.ownText().trim()
                if (own.isNotBlank()) {
                    val small = p.selectFirst("small")?.text()?.trim()
                    if (!small.isNullOrBlank()) "$own ($small)" else own
                } else {
                    p.text().trim()
                }
            } ?: return null

        val img = selectFirst("img.is-cover2, img")
        val posterUrl = img?.let {
            val dataSrc = it.attr("data-src")
            if (dataSrc.isNotBlank()) dataSrc else it.attr("src")
        }

        return if (href.contains("/actress/")) {
            newTvSeriesSearchResponse(title, fixUrl(href), TvType.NSFW) {
                this.posterUrl = fixUrlNull(posterUrl)
            }
        } else {
            newMovieSearchResponse(title, fixUrl(href), TvType.NSFW) {
                this.posterUrl = fixUrlNull(posterUrl)
            }
        }
    }

    override suspend fun search(query: String): List<SearchResponse> {
        val url = "$mainUrl/search/$query"
        val document = app.get(url).document
        return document.select("div.card").mapNotNull {
            it.toSearchResult()
        }
    }

    override suspend fun load(url: String): LoadResponse {
        val document = app.get(url).document

        if (url.contains("/actress/")) {
            val episodes = mutableListOf<Episode>()
            val doc1 = document

            fun parseDoc(doc: org.jsoup.nodes.Document) {
                val cards = doc.select("div.card")
                cards.forEach { card ->
                    val epurl = card.selectFirst("h5.title a, h5.card-header a")?.attr("href") ?: return@forEach
                    val epname = card.selectFirst("h5.title a, h5.card-header a")?.text() ?: ""
                    val epimg = card.selectFirst("img.is-cover2, img")
                    val epposter = epimg?.let {
                        val dataSrc = it.attr("data-src")
                        if (dataSrc.isNotBlank()) dataSrc else it.attr("src")
                    }
                    episodes.add(newEpisode(fixUrl(epurl)) {
                        this.name = epname
                        this.posterUrl = fixUrlNull(epposter)
                    })
                }
            }

            parseDoc(doc1)

            val paginationLinks = doc1.select("ul.pagination-list a.pagination-link, ul.pagination a, div.pagination a, nav.pagination a")
            val pageNums = paginationLinks.mapNotNull { it.text().toIntOrNull() }
            val maxPage = pageNums.maxOrNull() ?: 1
            val maxPageLimit = minOf(maxPage, 25)

            if (maxPageLimit > 1) {
                val pages = (2..maxPageLimit).toList().amap { p ->
                    try {
                        val pageRes = app.get(if (url.contains("?")) "$url&page=$p" else "$url?page=$p")
                        if (pageRes.code == 200) pageRes.document else null
                    } catch (e: Exception) {
                        null
                    }
                }
                pages.filterNotNull().forEach { doc ->
                    parseDoc(doc)
                }
            }

            val docTitle = doc1.title().substringBefore("-").trim()
            val title = if (docTitle.isNotBlank() && !docTitle.contains("OneJav", ignoreCase = true)) {
                docTitle
            } else {
                url.substringAfterLast("/").replace("%20", " ").replace("+", " ").replace("%2520", " ")
            }

            return newTvSeriesLoadResponse(title, url, TvType.NSFW, episodes) {
                this.posterUrl = episodes.firstOrNull()?.posterUrl
            }
        }

        val title = document.selectFirst("h5.title a, h5.card-header a")?.text() ?: ""
        val img = document.selectFirst("img.is-cover2, img")
        val poster = img?.let {
            val dataSrc = it.attr("data-src")
            if (dataSrc.isNotBlank()) dataSrc else it.attr("src")
        }
        val tags = document.select("div.tags a.tag").map { it.text().trim() }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = fixUrlNull(poster)
            this.tags = tags
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val document = app.get(data).document
        document.select("a").forEach {
            val href = it.attr("href")
            if (href.startsWith("magnet:")) {
                val linkName = it.text().ifBlank { "Magnet" }
                callback.invoke(
                    newExtractorLink(
                        source = this.name,
                        name = linkName,
                        url = href,
                        type = ExtractorLinkType.MAGNET
                    ) {
                        this.quality = Qualities.Unknown.value
                    }
                )
            } else if (href.endsWith(".torrent", ignoreCase = true)) {
                val linkName = it.text().ifBlank { "Torrent" }
                callback.invoke(
                    newExtractorLink(
                        source = this.name,
                        name = linkName,
                        url = fixUrl(href),
                        type = ExtractorLinkType.TORRENT
                    ) {
                        this.quality = Qualities.Unknown.value
                    }
                )
            }
        }
        return true
    }
}
