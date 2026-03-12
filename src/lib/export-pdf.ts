import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Renders the A4 preview element to a PDF and triggers download.
 * Creates a temporary off-screen clone at full A4 scale (no CSS transform)
 * to ensure crisp output.
 */
export async function exportToPdf(
  previewElement: HTMLElement,
  filename: string = "cv.pdf"
): Promise<void> {
  // Clone the preview so we can render at full scale off-screen
  const clone = previewElement.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = "210mm";
  clone.style.minHeight = "297mm";
  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: clone.scrollWidth,
      height: clone.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = 210;
    const pdfHeight = 297;
    const canvasRatio = canvas.height / canvas.width;
    const imgHeight = pdfWidth * canvasRatio;

    // If content fits in one page
    if (imgHeight <= pdfHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, imgHeight);
    } else {
      // Multi-page: slice the canvas
      let remainingHeight = canvas.height;
      let position = 0;
      const pageCanvasHeight = (pdfHeight / pdfWidth) * canvas.width;

      while (remainingHeight > 0) {
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(pageCanvasHeight, remainingHeight);

        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, position,
            canvas.width, pageCanvas.height,
            0, 0,
            canvas.width, pageCanvas.height
          );
        }

        const pageImgData = pageCanvas.toDataURL("image/png");
        const pageImgHeight = (pageCanvas.height / canvas.width) * pdfWidth;

        if (position > 0) pdf.addPage();
        pdf.addImage(pageImgData, "PNG", 0, 0, pdfWidth, pageImgHeight);

        remainingHeight -= pageCanvasHeight;
        position += pageCanvasHeight;
      }
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(clone);
  }
}
