package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import org.jsoup.nodes.Element
import com.lagradost.cloudstream3.SearchQuality
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import kotlin.math.min
import java.util.concurrent.atomic.AtomicBoolean

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

class XnhauProvider : MainAPI() {
    override var mainUrl = "https://xnhau.im"
    override var name = "xNhau"
    override val hasMainPage = true
    override var lang = "vi"
    override val hasDownloadSupport = true
    override val supportedTypes = setOf(
        TvType.NSFW
    )
    private val storageUrl = "https://xnhaustorage.com"

    private data class VideoPathInfo(val group: String, val videoId: String)

    private fun Element.toSearchResponse(): SearchResponse? {
        val aTag = this.selectFirst("a") ?: return null
        val href = fixUrlNull(aTag.attr("href")) ?: return null
        val title = aTag.selectFirst("strong.title")?.text()?.trim() ?: aTag.attr("title").trim()
        if (title.isBlank() || href.isBlank()) return null

        val imgTag = aTag.selectFirst(".img img.thumb")
        var posterUrlExtracted = fixUrlNull(imgTag?.attr("data-original"))
        if (posterUrlExtracted.isNullOrBlank()) {
            posterUrlExtracted = fixUrlNull(imgTag?.attr("src"))
        }
        val webpUrl = fixUrlNull(imgTag?.attr("data-webp"))
        if (!webpUrl.isNullOrBlank()) {
            posterUrlExtracted = webpUrl
        }

        val qualityDetected = if (aTag.selectFirst(".is-hd") != null) SearchQuality.HD else SearchQuality.SD

        return newMovieSearchResponse(
            name = title,
            url = href
        ) {
            this.posterUrl = posterUrlExtracted
            this.quality = qualityDetected
        }
    }

    private fun qualityStringToInt(qualityLabel: String?): Int {
         return qualityLabel?.filter { it.isDigit() }?.toIntOrNull() ?: 0
    }

    private fun extractJsVar(jsString: String, key: String): String? {
        return Regex("""['"]?$key['"]?\s*:\s*['"]?([^'",]+)['"]?,?""").find(jsString)?.groupValues?.get(1)?.trim()
    }

    private fun findJsVariableContent(html: String, variableName: String): String? {
        val startMarker = "var $variableName = {"
        val startIndex = html.indexOf(startMarker)
        if (startIndex == -1) { return null }
        val endIndexSemicolon = html.indexOf("};", startIndex + startMarker.length)
        val endIndexBrace = html.indexOf("}", startIndex + startMarker.length)
        val endIndex = min(
            if (endIndexSemicolon != -1) endIndexSemicolon else Int.MAX_VALUE,
            if (endIndexBrace != -1) endIndexBrace else Int.MAX_VALUE
        )
        if (endIndex == Int.MAX_VALUE) return null
        return html.substring(startIndex + startMarker.length, endIndex).trim()
    }

    private fun extractGroupFromPosterUrl(posterUrl: String?): String? {
        if (posterUrl.isNullOrBlank()) return null
        return Regex("""/videos_screenshots/(\d+)/""").find(posterUrl)?.groupValues?.get(1)
    }

    private suspend fun checkUrlExists(url: String, referer: String?): Boolean {
        return try {
            val response = app.get(url, referer = referer, headers = mapOf("Range" to "bytes=0-0"), allowRedirects = true)
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        val homePageItems = listOf(
           Pair("Đang Xem", "/"),
           Pair("Mới Nhất", "/clip-sex-moi/"),
           Pair("Hay Nhất", "/clip-sex-hay/"),
           Pair("Hot Nhất", "/clip-sex-hot/")
       )

        val allResults = mutableListOf<HomePageList>()
        val hasNextPageAtomic = AtomicBoolean(request.data == "/clip-sex-moi/")

        coroutineScope {
            val deferredHomePageLists = homePageItems.map { (name, url) ->
                async {
                    val currentPage = if (request.data == url) page else 1
                    if (currentPage > 1 && url != "/clip-sex-moi/") return@async null

                    try {
                        val pageUrl = if (currentPage > 1 && url == "/clip-sex-moi/") {
                            fixUrl(url.removeSuffix("/") + "/$currentPage/")
                        } else {
                            fixUrl(url)
                        }
                        val document = app.get(pageUrl).document

                        val itemsSelector = when (url) {
                            "/" -> "#list_videos_videos_watched_right_now_items .item"
                            "/clip-sex-moi/" -> ".main-container .list-videos .item"
                            "/clip-sex-hay/" -> "#list_videos_common_videos_list_items .item"
                            "/clip-sex-hot/" -> "#list_videos_common_videos_list_items .item"
                            else -> ".main-container .list-videos .item"
                        }

                        val items = document.select(itemsSelector).mapNotNull { it.toSearchResponse() }

                        if (url == "/clip-sex-moi/") {
                             val hasNextLink = document.select(".pagination .next a[href]").isNotEmpty()
                             hasNextPageAtomic.set(hasNextLink)
                        }

                        if (items.isNotEmpty()) {
                            HomePageList(name, items)
                        } else {
                            null
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        null
                    }
                }
            }
            allResults.addAll(deferredHomePageLists.awaitAll().filterNotNull())
        }

        val orderedResults = homePageItems.mapNotNull { (name, _) ->
            allResults.find { it.name == name }
        }

        if (orderedResults.isEmpty() && page == 1) {
            throw ErrorLoadingException("Không tải được trang chủ")
        }

        return newHomePageResponse(orderedResults, hasNext = hasNextPageAtomic.get() && request.data == "/clip-sex-moi/")
    }

    override suspend fun search(query: String): List<SearchResponse>? {
        val searchUrl = "$mainUrl/search/${query}/"
        val document = app.get(searchUrl).document
        return document.select("#list_videos_videos_list_search_result_items .item").mapNotNull { it.toSearchResponse() }
    }

    override suspend fun load(url: String): LoadResponse? {
        val document = app.get(url).document
        val htmlContent = document.html()
        val flashvarsString = findJsVariableContent(htmlContent, "flashvars")
        val title = extractJsVar(flashvarsString ?: "", "video_title")
            ?: document.selectFirst("head title")?.text()?.substringBefore(" - xNhau")?.trim()
            ?: "Không có tiêu đề"
        val posterUrl = document.selectFirst("meta[property=og:image]")?.attr("content")
            ?: fixUrlNull(extractJsVar(flashvarsString ?: "", "preview_url2"))
            ?: fixUrlNull(extractJsVar(flashvarsString ?: "", "preview_url1"))
            ?: fixUrlNull(extractJsVar(flashvarsString ?: "", "preview_url"))

        val description = document.selectFirst("meta[name=description]")?.attr("content")?.trim()
            ?: document.selectFirst(".info .item:contains(Mô tả:)")?.text()?.replace("Mô tả:", "")?.trim()
        val tags = (document.select(".info-content a[href^=/tags/]").mapNotNull { it.text() } +
                document.select(".info-content a[href^=/the-loai/]").mapNotNull { it.text() }).distinct()
        val recommendations = document.select("#list_videos_related_videos_items .item").mapNotNull { it.toSearchResponse() }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = posterUrl
            this.plot = description
            this.tags = tags
            this.recommendations = recommendations
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val document = app.get(data).document
        val htmlContent = document.html()

        val pageContextString = findJsVariableContent(htmlContent, "pageContext")
        val videoId = extractJsVar(pageContextString ?: "", "videoId")
                       ?: data.substringAfterLast("video/", "").substringBefore("/")

        val posterUrl = document.selectFirst("meta[property=og:image]")?.attr("content")
        val group = extractGroupFromPosterUrl(posterUrl)

        if (videoId.isBlank() || group.isNullOrBlank()) {
            return false
        }

        return generateAndVerifyLinks(group, videoId, callback)
    }

    private suspend fun generateAndVerifyLinks(
        group: String,
        videoId: String,
        callback: (ExtractorLink) -> Unit
    ) : Boolean {
         try {
             val qualitiesToCheck = listOf(
                 Triple("1080", "_1080p", 1080),
                 Triple("720", "_720p", 720),
                 Triple("480", "", 480)
             )

            var foundLink = false
             qualitiesToCheck.sortedByDescending { it.third }.forEach { (qualityLabel, suffix, qualityInt) ->
                 val fileName = "$videoId$suffix.mp4"
                 val fileUrl = "$storageUrl/$group/$videoId/$fileName"

                 if (checkUrlExists(fileUrl, mainUrl)) {
                     callback(
                        newExtractorLink(
                            source = this.name,
                            name = "${this.name} ${qualityLabel}p",
                            url = fileUrl,
                            type = ExtractorLinkType.VIDEO
                        ) {
                            this.referer = mainUrl
                            this.quality = qualityInt
                        }
                    )
                    foundLink = true
                 }
            }

            if (!foundLink) {
                 val fileName480 = "$videoId.mp4"
                 val fileUrl480 = "$storageUrl/$group/$videoId/$fileName480"
                  callback(
                        newExtractorLink(
                            source = this.name,
                            name = "${this.name} 480p",
                            url = fileUrl480,
                            type = ExtractorLinkType.VIDEO
                        ) {
                            this.referer = mainUrl
                            this.quality = 480
                        }
                    )
                 foundLink = true
            }

            return foundLink
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
}
