package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import org.jsoup.nodes.Element

class Javbangers : MainAPI() {
    override var mainUrl = "https://www.javbangers.com"
    override var name = "Javbangers"
    override val hasMainPage = true
    override var lang = "en"
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.NSFW)
    override val vpnStatus = VPNStatus.MightBeNeeded

    override val mainPage = mainPageOf(
        "$mainUrl/" to "Latest Videos"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page == 1) request.data else "${request.data}/page/${page}/"
        val document = app.get(url).document
        
        val home = document.select("a[href*=/video/]").mapNotNull { it.toSearchResult() }.distinctBy { it.url }
        
        return newHomePageResponse(
            HomePageList(request.name, home, isHorizontalImages = true),
            hasNext = home.isNotEmpty()
        )
    }

    private fun Element.toSearchResult(): SearchResponse? {
        var title = this.attr("title")
        if (title.isBlank()) title = this.selectFirst("img")?.attr("alt") ?: ""
        if (title.isBlank()) title = this.text()
        title = title.trim()
        if (title.isBlank()) return null
        
        val href = fixUrlNull(this.attr("href")) ?: return null
        if (!href.contains("/video/")) return null

        var posterUrl = this.selectFirst("img.cover.lazy-load")?.attr("data-original")
        if (posterUrl.isNullOrBlank()) posterUrl = this.selectFirst("img.thumb.lazy-load")?.attr("data-original")
        if (posterUrl.isNullOrBlank()) posterUrl = this.selectFirst("img.lazy, img.lazy-load, img.lazyload")?.let { 
            it.attr("data-original").ifEmpty { it.attr("data-src") }.ifEmpty { it.attr("src") }
        }
        if (posterUrl.isNullOrBlank()) posterUrl = this.selectFirst("img")?.attr("src")

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            this.posterUrl = fixUrlNull(posterUrl)
        }
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val url = if (page == 1) "$mainUrl/search/?q=$query" else "$mainUrl/search/?q=$query&page=$page"
        val document = app.get(url).document
        val results = document.select("a[href*=/video/]").mapNotNull { it.toSearchResult() }.distinctBy { it.url }
        return newSearchResponseList(results, hasNext = results.isNotEmpty())
    }

    override suspend fun load(url: String): LoadResponse? {
        val document = app.get(url).document

        val title = document.selectFirst("h1")?.text()?.trim() 
            ?: document.selectFirst("meta[property=og:title]")?.attr("content")?.trim() 
            ?: return null

        val poster = document.selectFirst("meta[property=og:image]")?.attr("content")
        val description = document.selectFirst("meta[name=description]")?.attr("content")

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = fixUrlNull(poster)
            this.plot = description
        }
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        val document = app.get(data).document
        val html = document.html()
        
        // Find video URLs from flashvars
        val videoUrlRegex = Regex("""video(?:_alt)?_url:\s*'([^']+)'""")
        val textRegex = Regex("""video(?:_alt)?_url_text:\s*'([^']+)'""")
        
        val urlMatches = videoUrlRegex.findAll(html).toList()
        val textMatches = textRegex.findAll(html).toList()
        
        urlMatches.forEachIndexed { index, matchResult ->
            val url = matchResult.groupValues.getOrNull(1) ?: return@forEachIndexed
            if (url.isNotBlank()) {
                val qualityText = textMatches.getOrNull(index)?.groupValues?.getOrNull(1) ?: "Unknown"
                val quality = when {
                    qualityText.contains("1080") -> Qualities.P1080.value
                    qualityText.contains("720") -> Qualities.P720.value
                    qualityText.contains("480") -> Qualities.P480.value
                    qualityText.contains("360") -> Qualities.P360.value
                    else -> Qualities.Unknown.value
                }
                
                callback.invoke(
                    newExtractorLink(
                        source = name,
                        name = "$name $qualityText",
                        url = fixUrlNull(url) ?: url,
                        type = if (url.contains(".m3u8")) ExtractorLinkType.M3U8 else ExtractorLinkType.VIDEO
                    ) {
                        this.referer = data
                        this.quality = quality
                    }
                )
            }
        }
        
        // Find iframes just in case
        document.select("iframe[src]").forEach {
            val src = it.attr("src")
            if (src.isNotBlank() && !src.contains("banner.go")) {
                loadExtractor(fixUrl(src), data, subtitleCallback, callback)
            }
        }
        
        // Kadang video tag juga ada
        document.select("video source[src]").forEach {
            val src = it.attr("src")
            if (src.isNotBlank()) {
                callback.invoke(
                    newExtractorLink(
                        source = name,
                        name = name,
                        url = fixUrl(src),
                        type = if (src.contains(".m3u8")) ExtractorLinkType.M3U8 else ExtractorLinkType.VIDEO
                    ) {
                        this.referer = data
                        this.quality = Qualities.Unknown.value
                    }
                )
            }
        }

        return true
    }
}
