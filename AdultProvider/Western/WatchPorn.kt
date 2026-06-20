package com.lagradost.cloudstream3.AdultProvider.Western

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import org.json.JSONArray
import org.jsoup.nodes.Element
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class WatchPorn(context: Context) : MainAPI() {
    override var mainUrl = "https://watchporn.to"
    override var name = "WatchPorn"
    override val hasMainPage = true
    override var lang = "en"
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.NSFW)

    private val context = context

    override val mainPage = mainPageOf(
        "${mainUrl}/top-rated/" to "Top Rated",
        "${mainUrl}/most-popular/" to "Most Popular",
        "${mainUrl}/categories/manyvids/" to "ManyVids",
        "${mainUrl}/categories/onlyfans/" to "OnlyFans",
        "${mainUrl}/categories/xvideosred/" to "XVideosRed",
        "${mainUrl}/categories/primalfetish/" to "PrimalFetish",
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page <= 1) request.data else "${request.data}$page/"
        val document = app.get(url).document
        val home = document.select("div.thumb.item").mapNotNull { it.toMainPageResult() }
        return newHomePageResponse(request.name, home, hasNext = true)
    }

    private fun Element.toMainPageResult(): SearchResponse? {
        val title = this.selectFirst("span.thumb__title")?.text()?.trim() ?: return null
        val href = fixUrlNull(this.selectFirst("a")?.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("data-webp") ?: this.selectFirst("img")?.attr("src"))

        return newMovieSearchResponse(title, "$href|$posterUrl", TvType.NSFW) { this.posterUrl = posterUrl }
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val url = "${mainUrl}/search/?q=$query&mode=async&function=get_block&block_id=list_videos_videos_list_search_result&from_videos=$page"
        val document = app.get(url).document
        val results = document.select("div.thumb.item").mapNotNull { it.toMainPageResult() }
        return newSearchResponseList(results, true)
    }

    override suspend fun load(data: String): LoadResponse? {
        val (url, storedPoster) = data.split("|").let {
            it[0] to it.getOrNull(1)
        }

        val response = app.get(url)
        val document = response.document
        val title = document.selectFirst("h1.single__content-title")?.text()?.trim() ?: return null
        val poster = storedPoster ?: document.selectFirst("meta[property=og:image]")?.attr("content")
        val tags = document.select("div.single__info-row:contains(Tags:) a").map { it.text().trim() }
        val actors = document.select("div.single__info-row:contains(Models:) a").map { Actor(it.text().trim()) }
        val recommendations = document.select("div.related-videos div.thumb.item").mapNotNull { it.toMainPageResult() }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = poster
            this.tags = tags
            this.recommendations = recommendations
            addActors(actors)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun extractVideoUrls(
        context: Context,
        html: String
    ): List<String> = suspendCoroutine { continuation ->

        Handler(Looper.getMainLooper()).post {
            val wv = WebView(context.applicationContext).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true

                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Handler(Looper.getMainLooper()).postDelayed({
                            view?.evaluateJavascript("""
                            (function() {
                                var videos = [];
                                if (typeof flashvars !== 'undefined') {
                                    if (flashvars.video_url && flashvars.video_url.indexOf('https://') !== -1) videos.push(flashvars.video_url);
                                    if (flashvars.video_alt_url && flashvars.video_alt_url.indexOf('https://') !== -1) videos.push(flashvars.video_alt_url);
                                }
                                if (videos.length === 0) {
                                    var scripts = document.getElementsByTagName('script');
                                    for (var i = 0; i < scripts.length; i++) {
                                        var text = scripts[i].textContent;
                                        var matches = text.match(/https:\/\/watchporn\.to\/get_file\/[^\s'"]+\.mp4[^\s'"]*/g);
                                        if (matches) {
                                            for (var j = 0; j < matches.length; j++) videos.push(matches[j]);
                                        }
                                    }
                                }
                                return JSON.stringify(videos);
                            })();
                        """) { result ->
                                try {
                                    val cleanResult = result.trim('"').replace("\\", "")
                                    val videoUrls = JSONArray(cleanResult)
                                    val urls = mutableListOf<String>()
                                    for (i in 0 until videoUrls.length()) urls.add(videoUrls.getString(i))
                                    continuation.resume(urls)
                                    this@apply.destroy()
                                } catch (e: Exception) {
                                    continuation.resume(emptyList())
                                }
                            }
                        }, 500)
                    }
                }
                loadDataWithBaseURL(mainUrl, html, "text/html", "UTF-8", null)
            }
        }
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        val html = app.get(data).text
        val videoUrls = extractVideoUrls(context, html)

        videoUrls.forEach { url ->
            val quality = url.substringBeforeLast("/").substringAfterLast("/").substringBefore(".").substringAfter("_")
            callback.invoke(
                newExtractorLink(
                    name,
                    name,
                    url,
                    type = ExtractorLinkType.VIDEO
                ) {
                    this.referer = "$mainUrl/"
                    this.quality = getQualityFromName(quality)
                }
            )
        }
        return videoUrls.isNotEmpty()
    }
}
