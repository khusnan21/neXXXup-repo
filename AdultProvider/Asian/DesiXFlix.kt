package com.lagradost.cloudstream3.AdultProvider.Asian

import android.util.Log
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.mvvm.logError
import com.lagradost.cloudstream3.utils.*
import org.jsoup.nodes.Document

class DesiXFlix : MainAPI() {
    override var mainUrl = "https://desixflix.com"
    override var name = "DesiXFlix"
    override val supportedTypes = setOf(TvType.NSFW)
    override var lang = "en"
    override val hasMainPage = true

    override suspend fun search(query: String): List<SearchResponse> {
        val url = "$mainUrl/?s=$query"
        val res = app.get(url)
        return searchResponseBuilder(res.document)
    }

    override suspend fun quickSearch(query: String): List<SearchResponse> = search(query)

    override val mainPage =
            mainPageOf(
                    "$mainUrl/page/" to "Latest videos",
                    "$mainUrl/hot-web-series/page/" to "Hot Web Series",
                    "$mainUrl/hot-short-film/page/" to "Hot Short Film",
                    "$mainUrl/alt-balaji/page/" to "ALTBalaji",
                    "$mainUrl/ullu/page/" to "Ullu",
                    "$mainUrl/hotslive/page/" to "Hots Live",
            )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = request.data + page
        val res = app.get(url)
        if (res.code != 200) throw ErrorLoadingException("Could not load data")
        val home = searchResponseBuilder(res.document)

        return newHomePageResponse(HomePageList(request.name, home, true), true)
    }

    override suspend fun load(url: String): LoadResponse {
        val res = app.get(url)

        if (res.code != 200) throw ErrorLoadingException("Could not load data" + url)
        val poster =
                res.document
                        .selectFirst("div.video-player > meta[itemprop=thumbnailUrl]")
                        ?.attr("content")
        val embedUrl =
                res.document
                        .selectFirst(
                                "div.video-player > meta[itemprop=embedURL], meta[itemprop=contentURL]"
                        )
                        ?.attr("content")
        val details = res.document.select("div#video-about")
        val name = details.select("div.more > h2").text()

        return newMovieLoadResponse(name, url, TvType.NSFW, embedUrl) { this.posterUrl = poster }
    }

    override suspend fun loadLinks(
            data: String,
            isCasting: Boolean,
            subtitleCallback: (SubtitleFile) -> Unit,
            callback: (ExtractorLink) -> Unit
    ): Boolean {
        Log.d("Rushi", data)
        when {
            data.contains("d0000d") -> {
                D0000dExtractor().getUrl(data, data)?.forEach { link -> callback.invoke(link) }
            }
            data.contains("hotxseries") -> {
                val serverName = "HotxSeries"
                try {
                    callback.invoke(
                        newExtractorLink(
                            source = serverName,
                            name = serverName,
                            url = data,
                        )
                    )
                } catch (e: Exception) {
                    logError(e)
                }

            }
            else -> loadExtractor(data, subtitleCallback, callback)
        }
        return true
    }

    private fun searchResponseBuilder(webDocument: Document): List<SearchResponse> {
        val searchCollection =
                webDocument.select("article > a").mapNotNull { element ->
                    val title = element.attr("title")
                    val link = element.attr("href")
                    val poster = element.select("img").attr("data-src")

                    newMovieSearchResponse(title, link) { this.posterUrl = poster }
                }
        return searchCollection
    }
}

class D0000dExtractor : ExtractorApi() {
    override var name = "DoodStream"
    override var mainUrl = "https://d0000d.com"
    override val requiresReferer = false

    override suspend fun getUrl(url: String, referer: String?): List<ExtractorLink>? {
        val response0 = app.get(url).text
        val md5 = mainUrl + (Regex("/pass_md5/[^']*").find(response0)?.value ?: return null)
        val res = app.get(md5, referer = mainUrl + "/e/" + url.substringAfterLast("/"))
        val trueUrl =
                if (res.toString().contains("cloudflarestorage")) res.toString()
                else res.text + "zUEJeL3mUN?token=" + md5.substringAfterLast("/")

        val quality =
                Regex("\\d{3,4}p")
                        .find(response0.substringAfter("<title>").substringBefore("</title>"))
                        ?.groupValues
                        ?.get(0)

        return listOf(
            newExtractorLink(
                source = this.name,
                name = this.name,
                url = trueUrl,
            ).apply {
                this.referer = mainUrl
                this.quality = getQualityFromName(quality)
            }
        )
    }
}
