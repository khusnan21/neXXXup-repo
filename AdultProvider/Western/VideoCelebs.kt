package com.lagradost.cloudstream3.AdultProvider.Western

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import org.json.JSONArray
import org.jsoup.nodes.Element
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class VideoCelebs(context: Context) : MainAPI() {
    override var mainUrl = "https://videocelebs.net"
    override var name = "VideoCelebs"
    override val hasMainPage = true
    override var lang = "en"
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.NSFW)
    override val vpnStatus = VPNStatus.MightBeNeeded

    private val context = context

    override val mainPage = mainPageOf(
        "$mainUrl/" to "Home",
        "$mainUrl/new-celebrity-videos/" to "New Videos",
        "$mainUrl/most-popular-celebrity-porn/" to "Most Popular",
        "$mainUrl/top-rated-nude-celebs/" to "Top Rated",
        "$mainUrl/celebreties/" to "Celebrities"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page <= 1) request.data else "${request.data}page/$page/"
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
        val recommendations = document.select("div.item").mapNotNull { it.toSearchResult() }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = poster
            this.plot = plot
            this.tags = tags
            this.recommendations = recommendations
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun createWebViewAndExtractVideo(
        context: Context,
        html: String
    ): List<VideoQuality> = suspendCoroutine { continuation ->

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
                                    if (flashvars.video_url) videos.push({url: flashvars.video_url, quality: '720p'});
                                    if (flashvars.video_alt_url) videos.push({url: flashvars.video_alt_url, quality: '1080p'});
                                    if (flashvars.video_alt_url2) videos.push({url: flashvars.video_alt_url2, quality: '480p'});
                                }
                                
                                if (videos.length === 0) {
                                    var scripts = document.getElementsByTagName('script');
                                    for (var i = 0; i < scripts.length; i++) {
                                        var text = scripts[i].textContent;
                                        var matches = text.match(/https:\/\/videocelebs\.net\/get_file\/[^\s'"]+\.mp4[^\s'"]*/g);
                                        if (matches) {
                                            for (var j = 0; j < matches.length; j++) {
                                                var q = 'Unknown';
                                                if (matches[j].indexOf('_720p') !== -1) q = '720p';
                                                else if (matches[j].indexOf('_1080p') !== -1) q = '1080p';
                                                else if (matches[j].indexOf('_480p') !== -1) q = '480p';
                                                videos.push({url: matches[j], quality: q});
                                            }
                                        }
                                    }
                                }
                                return JSON.stringify(videos);
                            })();
                        """) { result ->
                                try {
                                    val cleanResult = result.trim('"').replace("\\", "")
                                    val jsonArray = JSONArray(cleanResult)
                                    val qualities = mutableListOf<VideoQuality>()
                                    for (i in 0 until jsonArray.length()) {
                                        val obj = jsonArray.getJSONObject(i)
                                        qualities.add(VideoQuality(obj.getString("url"), obj.getString("quality")))
                                    }
                                    continuation.resume(qualities)
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
        val qualities = createWebViewAndExtractVideo(context, html)

        qualities.forEach { q ->
            callback.invoke(
                newExtractorLink(
                    source = name,
                    name = name,
                    url = q.url,
                    type = ExtractorLinkType.VIDEO
                ) {
                    this.referer = "$mainUrl/"
                    this.quality = getQualityFromName(q.quality)
                }
            )
        }
        return qualities.isNotEmpty()
    }

    data class VideoQuality(val url: String, val quality: String)
}
