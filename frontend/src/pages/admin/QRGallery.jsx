import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api, formatErr, fileUrl, fmtMoney, API } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import {
  FolderOpen, Folder, ArrowLeft, Share2, Download, Eye, X, ChevronRight,
  ChevronLeft, Calendar, FileImage, Loader2, Search
} from "lucide-react";

export default function AdminQRGallery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("daily"); // "daily" | "archive"
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // Merchant Archive Specific States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeArchiveMerchant, setActiveArchiveMerchant] = useState(null);
  const [archivePage, setArchivePage] = useState(1);
  const archivePageSize = 20;

  // Date Pagination
  const [datePage, setDatePage] = useState(1);
  const datePageSize = 10;

  const reload = () => {
    setLoading(true);
    api.get("/admin/recharge-gallery")
      .then((r) => {
        setItems(r.data || []);
      })
      .catch((e) => {
        toast.error(formatErr(e.response?.data?.detail) || "Failed to fetch gallery proofs");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    reload();
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const formatTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const day = date.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  };

  // Extract unique dates sorted by date value descending
  const dates = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      if (item.created_at) {
        const dStr = formatDate(item.created_at);
        const ts = new Date(item.created_at).setHours(0, 0, 0, 0);
        map[dStr] = ts;
      }
    });
    return Object.keys(map).sort((a, b) => map[b] - map[a]);
  }, [items]);

  // Set default selected date
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  // Paginated dates list
  const paginatedDates = useMemo(() => {
    const start = (datePage - 1) * datePageSize;
    return dates.slice(start, start + datePageSize);
  }, [dates, datePage]);

  const totalDatePages = Math.ceil(dates.length / datePageSize) || 1;

  // Filter items by selected date
  const filteredByDate = useMemo(() => {
    if (!selectedDate) return [];
    return items.filter((item) => formatDate(item.created_at) === selectedDate);
  }, [items, selectedDate]);

  // Group by QR Name
  const groupedByQr = useMemo(() => {
    const groups = {};
    filteredByDate.forEach((item) => {
      const qrLabel = item.qr_code_label || "Other / Unlabeled";
      if (!groups[qrLabel]) {
        groups[qrLabel] = [];
      }
      groups[qrLabel].push(item);
    });
    return groups;
  }, [filteredByDate]);

  // Chunk array into groups of 10
  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  const shareFolder = (folderItems) => {
    const text = folderItems
      .map(
        (item) =>
          `Amount: ${fmtMoney(item.amount)} | Time: ${formatDateTime(
            item.created_at
          )}\nLink: ${window.location.origin}${fileUrl(item.screenshot_path)}`
      )
      .join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Folder proof links copied to clipboard!");
  };

  const saveToPc = (folderItems) => {
    folderItems.forEach((item, idx) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = fileUrl(item.screenshot_path);
        link.download = `proof_${item.id}_${item.amount}.jpg`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 400);
    });
    toast.success(`Triggered download for all ${folderItems.length} proofs`);
  };

  // MERCHANT ARCHIVE: Group all approved recharges by QR label
  const allTimeApproved = useMemo(() => {
    return items.filter((x) => x.status === "approved");
  }, [items]);

  const merchantsList = useMemo(() => {
    const map = {};
    allTimeApproved.forEach((item) => {
      const qrLabel = item.qr_code_label || "Other / Unlabeled";
      if (!map[qrLabel]) {
        map[qrLabel] = [];
      }
      map[qrLabel].push(item);
    });
    return Object.keys(map).map((qrLabel) => ({
      qrLabel,
      items: map[qrLabel],
      count: map[qrLabel].length
    })).sort((a, b) => b.count - a.count);
  }, [allTimeApproved]);

  // Search filtered merchants
  const filteredMerchants = useMemo(() => {
    if (!searchQuery.trim()) return merchantsList;
    const q = searchQuery.toLowerCase();
    return merchantsList.filter((m) => m.qrLabel.toLowerCase().includes(q));
  }, [merchantsList, searchQuery]);

  // Merchant detail archive pagination
  const paginatedArchiveItems = useMemo(() => {
    if (!activeArchiveMerchant) return [];
    const start = (archivePage - 1) * archivePageSize;
    return activeArchiveMerchant.items.slice(start, start + archivePageSize);
  }, [activeArchiveMerchant, archivePage]);

  const totalArchivePages = useMemo(() => {
    if (!activeArchiveMerchant) return 1;
    return Math.ceil(activeArchiveMerchant.items.length / archivePageSize) || 1;
  }, [activeArchiveMerchant]);

  const handleZipDownload = (qrLabel) => {
    const t = localStorage.getItem("mfp_token");
    const downloadUrl = `${API}/admin/recharge-gallery/zip?qr_code_label=${encodeURIComponent(qrLabel)}&auth=${encodeURIComponent(t || "")}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `gallery_${qrLabel}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exporting approved proofs for ${qrLabel} as ZIP`);
  };

  return (
    <div className="w-full min-h-screen pb-12">
      <PageHeader
        title="QR Gallery"
        subtitle="Organized auditing of all payment proofs from the system inception."
        actions={
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-black/5 shadow-sm select-none">
            <button
              onClick={() => {
                setActiveTab("daily");
                setActiveFolder(null);
                setActiveArchiveMerchant(null);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                activeTab === "daily"
                  ? "bg-[#1B4332]/10 text-[#1B4332] border border-[#1B4332]/10"
                  : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              Daily Audits
            </button>
            <button
              onClick={() => {
                setActiveTab("archive");
                setActiveFolder(null);
                setActiveArchiveMerchant(null);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                activeTab === "archive"
                  ? "bg-[#1B4332]/10 text-[#1B4332] border border-[#1B4332]/10"
                  : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              Merchant Archive
            </button>
          </div>
        }
      />

      {activeTab === "daily" ? (
        /* DAILY AUDITS TAB VIEW */
        <div className="flex flex-col md:flex-row gap-8 items-start animate-fadeIn">
          {/* Left Side: Select Audit Date List */}
          <div className="bg-white rounded-3xl border border-black/5 p-6 w-full md:w-[320px] shrink-0 shadow-sm flex flex-col justify-between min-h-[480px]">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-black/5 pb-3.5 mb-2">
                <Calendar className="h-4.5 w-4.5 text-[#1B4332]" />
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Select Audit Date
                </span>
              </div>

              {loading ? (
                <div className="space-y-2 py-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-10 bg-neutral-100 rounded-xl animate-pulse w-full" />
                  ))}
                </div>
              ) : dates.length === 0 ? (
                <div className="text-center text-xs text-neutral-400 py-12">
                  No audited dates found
                </div>
              ) : (
                <div className="space-y-1">
                  {paginatedDates.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setSelectedDate(d);
                        setActiveFolder(null);
                      }}
                      className={`w-full flex items-center justify-between py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                        selectedDate === d
                          ? "bg-[#1B4332] text-white shadow-md shadow-[#1B4332]/10 scale-[1.01]"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800"
                      }`}
                    >
                      <span>{d}</span>
                      {selectedDate === d ? (
                        <ChevronRight className="h-4 w-4 text-white" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-neutral-300" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Pagination Bar */}
            {dates.length > datePageSize && (
              <div className="flex items-center justify-between border-t border-black/5 pt-4 mt-6">
                <button
                  disabled={datePage === 1}
                  onClick={() => setDatePage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-black/5 hover:bg-neutral-50 text-neutral-500 disabled:opacity-40 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Page {datePage} of {totalDatePages}
                </span>
                <button
                  disabled={datePage === totalDatePages}
                  onClick={() => setDatePage((p) => Math.min(totalDatePages, p + 1))}
                  className="p-1.5 rounded-lg border border-black/5 hover:bg-neutral-50 text-neutral-500 disabled:opacity-40 transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right Side Panel */}
          <div className="flex-1 bg-white rounded-3xl border border-black/5 p-6 lg:p-8 w-full shadow-sm min-h-[480px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Loader2 className="h-8 w-8 text-[#1B4332] animate-spin" />
                <span className="text-xs text-neutral-400 font-bold">Scanning proof gallery...</span>
              </div>
            ) : !selectedDate ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <FileImage className="h-12 w-12 text-neutral-300 stroke-1" />
                <h3 className="text-sm font-bold text-neutral-600 mt-3">No Date Selected</h3>
                <p className="text-xs text-neutral-400 mt-1">Please select an audit date from the sidebar</p>
              </div>
            ) : activeFolder ? (
              /* FOLDER SCREENSHOT DETAIL VIEW */
              <div>
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-black/5 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveFolder(null)}
                      className="p-2 bg-neutral-50 hover:bg-neutral-100 border border-black/5 text-neutral-600 rounded-xl transition-all"
                    >
                      <ArrowLeft className="h-4.5 w-4.5" />
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400 font-extrabold uppercase tracking-widest">
                        <span className="truncate max-w-[150px]">{activeFolder.qrLabel}</span>
                        <span>&bull;</span>
                        <span className="text-[#1B4332]">Folder {activeFolder.folderIndex}</span>
                      </div>
                      <h3 className="text-sm font-black text-neutral-800 mt-0.5">{selectedDate}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => shareFolder(activeFolder.items)}
                      className="flex items-center gap-1.5 bg-[#00B4D8] hover:bg-[#0096C7] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-[#00B4D8]/10 active:scale-98"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share Proofs
                    </button>
                    <button
                      onClick={() => saveToPc(activeFolder.items)}
                      className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-[#4F46E5]/10 active:scale-98"
                    >
                      <Download className="h-3.5 w-3.5" /> Save to PC
                    </button>
                  </div>
                </div>

                {activeFolder.items.length === 0 ? (
                  <div className="text-center text-xs text-neutral-400 py-16">
                    No proofs found in this folder
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                    {activeFolder.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setPreviewImage(item)}
                        className="bg-white border border-black/5 rounded-3xl p-3 flex flex-col items-center space-y-3 hover:shadow-md cursor-pointer transition-all hover:scale-102 animate-fadeIn"
                      >
                        <div className="w-full aspect-[3/4] bg-neutral-50 rounded-2xl overflow-hidden border border-black/5 flex items-center justify-center relative group">
                          <img
                            src={fileUrl(item.screenshot_path)}
                            alt="payment proof"
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-2xl">
                            <Eye className="text-white h-5 w-5" />
                          </div>
                        </div>
                        <div className="text-center w-full">
                          <div className="text-xs font-black text-neutral-800">
                            {fmtMoney(item.amount)}
                          </div>
                          <div className="text-[9px] text-neutral-400 font-semibold mt-0.5">
                            {formatTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* GROUPED FOLDERS MAIN VIEW */
              <div>
                <div className="border-b border-black/5 pb-4 mb-6">
                  <h3 className="text-base font-black text-neutral-800">{selectedDate}</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Audits grouped by active merchant/UPI QR configurations
                  </p>
                </div>

                {filteredByDate.length === 0 ? (
                  <div className="text-center text-xs text-neutral-400 py-16">
                    No recharges or screenshots found for this date
                  </div>
                ) : (
                  <div className="space-y-8">
                    {Object.keys(groupedByQr).map((qrLabel) => {
                      const qrItems = groupedByQr[qrLabel];
                      const chunks = chunkArray(qrItems, 10);
                      return (
                        <div key={qrLabel} className="space-y-4 animate-fadeIn">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/50">
                              <FolderOpen className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                                {qrLabel}
                              </h4>
                              <span className="text-[9px] text-neutral-400 font-extrabold uppercase tracking-wide">
                                {qrItems.length} Audited Payments
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-5">
                            {chunks.map((chunk, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  setActiveFolder({
                                    qrLabel,
                                    folderIndex: idx + 1,
                                    items: chunk
                                  })
                                }
                                className="bg-white border border-black/5 hover:border-black/10 hover:shadow-md transition-all rounded-3xl p-5 flex flex-col items-center justify-center text-center space-y-3 w-[130px] aspect-square relative active:scale-98"
                              >
                                <div className="relative">
                                  <Folder className="h-11 w-11 text-[#1B4332] stroke-1" />
                                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black text-white bg-[#1B4332] px-1.5 py-0.5 rounded-full">
                                    {chunk.length}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-neutral-800">
                                    Folder {idx + 1}
                                  </div>
                                  <div className="text-[9px] text-neutral-400 font-semibold mt-0.5">
                                    Items {idx * 10 + 1}-{idx * 10 + chunk.length}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MERCHANT ARCHIVE TAB VIEW */
        <div className="animate-fadeIn">
          {activeArchiveMerchant ? (
            /* MERCHANT SPECIFIC VIEW WITH 20-20 IMAGE PAGINATION */
            <div className="bg-white rounded-3xl border border-black/5 p-6 lg:p-8 w-full shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-black/5 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveArchiveMerchant(null)}
                    className="p-2 bg-neutral-50 hover:bg-neutral-100 border border-black/5 text-neutral-600 rounded-xl transition-all"
                  >
                    <ArrowLeft className="h-4.5 w-4.5" />
                  </button>
                  <div>
                    <div className="flex items-center gap-1.5 text-[9px] text-indigo-500 font-extrabold uppercase tracking-widest">
                      <span>Merchant Archive</span>
                      <span>&bull;</span>
                      <span>{activeArchiveMerchant.items.length} Proofs</span>
                    </div>
                    <h3 className="text-sm font-black text-neutral-800 mt-0.5">
                      {activeArchiveMerchant.qrLabel}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => handleZipDownload(activeArchiveMerchant.qrLabel)}
                  className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md shadow-[#4F46E5]/10 active:scale-98"
                >
                  <Download className="h-3.5 w-3.5" /> Download All as ZIP
                </button>
              </div>

              {paginatedArchiveItems.length === 0 ? (
                <div className="text-center text-xs text-neutral-400 py-16">
                  No approved proofs available for this merchant
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {paginatedArchiveItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setPreviewImage(item)}
                      className="bg-white border border-black/5 rounded-3xl p-3 flex flex-col items-center space-y-3 hover:shadow-md cursor-pointer transition-all hover:scale-102 animate-fadeIn"
                    >
                      <div className="w-full aspect-[3/4] bg-neutral-50 rounded-2xl overflow-hidden border border-black/5 flex items-center justify-center relative group">
                        <img
                          src={fileUrl(item.screenshot_path)}
                          alt="payment proof"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-2xl">
                          <Eye className="text-white h-5 w-5" />
                        </div>
                      </div>
                      <div className="text-center w-full">
                        <div className="text-xs font-black text-neutral-800">
                          {fmtMoney(item.amount)}
                        </div>
                        <div className="text-[9px] text-neutral-400 font-semibold mt-0.5">
                          {formatDateTime(item.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 20-20 Pagination Controls */}
              {totalArchivePages > 1 && (
                <div className="flex items-center justify-between border-t border-black/5 pt-6 mt-8">
                  <button
                    disabled={archivePage === 1}
                    onClick={() => setArchivePage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-50 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">
                    Page {archivePage} of {totalArchivePages}
                  </span>
                  <button
                    disabled={archivePage === totalArchivePages}
                    onClick={() => setArchivePage((p) => Math.min(totalArchivePages, p + 1))}
                    className="px-4 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-50 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ALL MERCHANTS GRID VIEW WITH ZIP DOWNLOADS & SEARCH */
            <div className="space-y-6">
              {/* Search Bar and Total Count */}
              <div className="bg-white border border-black/5 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search merchant..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-neutral-50/50 border border-black/5 hover:border-black/10 focus:border-neutral-300 focus:bg-white transition-all pl-11 pr-4 py-2.5 rounded-2xl text-xs outline-none text-neutral-700"
                  />
                </div>
                <div className="text-[10px] font-black uppercase text-neutral-400 tracking-widest select-none">
                  Total {filteredMerchants.length} Merchants
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  <Loader2 className="h-8 w-8 text-[#1B4332] animate-spin" />
                  <span className="text-xs text-neutral-400 font-bold">Scanning merchant records...</span>
                </div>
              ) : filteredMerchants.length === 0 ? (
                <div className="text-center text-xs text-neutral-400 py-16 bg-white border border-black/5 rounded-3xl">
                  No merchants or approved proofs found
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
                  {filteredMerchants.map((m) => (
                    <div
                      key={m.qrLabel}
                      className="bg-white border border-black/5 rounded-3xl p-6 flex flex-col items-center justify-between text-center space-y-5 hover:shadow-md transition-all animate-fadeIn"
                    >
                      <div className="relative bg-neutral-50 p-4 rounded-full border border-black/5 flex items-center justify-center">
                        <FolderOpen className="h-10 w-10 text-[#1B4332] stroke-1" />
                        <span className="absolute -top-1 -right-1 text-[9px] font-black text-white bg-[#1B4332] px-2 py-0.5 rounded-full shadow-sm">
                          {m.count}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide line-clamp-1">
                          {m.qrLabel}
                        </h4>
                        <p className="text-[9px] text-neutral-400 font-black uppercase tracking-wider">
                          Proofs Available
                        </p>
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <button
                          onClick={() => {
                            setActiveArchiveMerchant(m);
                            setArchivePage(1);
                          }}
                          className="flex-1 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-50 text-xs font-bold text-neutral-600 transition-all active:scale-98"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleZipDownload(m.qrLabel)}
                          className="flex-1 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 shadow-md shadow-[#4F46E5]/10 active:scale-98"
                        >
                          <Download className="h-3.5 w-3.5" /> ZIP
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FULLSIZE SCREENSHOT VERIFICATION PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setPreviewImage(null)} />
          <div className="relative bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl z-10 border border-black/5 animate-scaleUp">
            <div className="p-5 border-b border-black/5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-neutral-800">
                  Payment Proof Verification
                </h4>
                <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                  Amount: {fmtMoney(previewImage.amount)} | Time: {formatDateTime(
                    previewImage.created_at
                  )}
                </p>
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1.5 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 bg-neutral-50 flex items-center justify-center max-h-[70vh] overflow-y-auto">
              <img
                src={fileUrl(previewImage.screenshot_path)}
                alt="Payment Proof Fullsize"
                className="max-h-[60vh] max-w-full object-contain rounded-2xl shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
