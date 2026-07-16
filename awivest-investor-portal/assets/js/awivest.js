/* AWIVEST Investor Portal - front-end behaviour */
(function ($) {
	'use strict';

	$(function () {
		// --- Drag & drop upload + client-side validation (KYC) ---
		var $dz = $('#awivest-dropzone');
		if ($dz.length) {
			var $input = $('#awivest-file');
			var $name = $dz.find('.awivest-filename');
			var allowed = ['pdf', 'jpg', 'jpeg', 'png', 'docx'];

			$dz.on('dragover', function (e) {
				e.preventDefault();
				$dz.addClass('dragover');
			});
			$dz.on('dragleave', function () {
				$dz.removeClass('dragover');
			});
			$dz.on('drop', function (e) {
				e.preventDefault();
				$dz.removeClass('dragover');
				var files = e.originalEvent.dataTransfer.files;
				if (files && files.length) {
					$input[0].files = files;
					$input.trigger('change');
				}
			});
			$input.on('change', function () {
				if (!this.files.length) {
					return;
				}
				var f = this.files[0];
				var ext = f.name.split('.').pop().toLowerCase();
				if (allowed.indexOf(ext) === -1) {
					alert('Unsupported file type. Allowed: PDF, JPG, PNG, DOCX.');
					this.value = '';
					$name.text('');
					return;
				}
				$name.text(f.name + ' (' + Math.round(f.size / 1024) + ' KB)');
			});
		}

		// --- Client-side table search ---
		$('.awivest-search').on('keyup', function () {
			var q = $(this).val().toLowerCase();
			var $target = $('#' + $(this).data('target'));
			$target.find('tbody tr').each(function () {
				$(this).toggle($(this).text().toLowerCase().indexOf(q) > -1);
			});
		});

		// --- Signature pad(s): works on any .awivest-sigpad canvas (forms, etc.) ---
		$('.awivest-sigpad').each(function () {
			var canvas = this;
			var ctx = canvas.getContext('2d');
			var drawing = false;
			var hasInk = false;
			ctx.lineWidth = 2;
			ctx.lineCap = 'round';
			ctx.strokeStyle = '#111';

			var $form = $(canvas).closest('form');
			var $hidden = $form.find('.awivest-signature-data').first();

			function pos(e) {
				var rect = canvas.getBoundingClientRect();
				var src = e.touches ? e.touches[0] : e;
				return {
					x: (src.clientX - rect.left) * (canvas.width / rect.width),
					y: (src.clientY - rect.top) * (canvas.height / rect.height)
				};
			}
			function start(e) {
				drawing = true;
				hasInk = true;
				var p = pos(e);
				ctx.beginPath();
				ctx.moveTo(p.x, p.y);
				e.preventDefault();
			}
			function move(e) {
				if (!drawing) {
					return;
				}
				var p = pos(e);
				ctx.lineTo(p.x, p.y);
				ctx.stroke();
				e.preventDefault();
			}
			function end() {
				drawing = false;
			}

			canvas.addEventListener('mousedown', start);
			canvas.addEventListener('mousemove', move);
			window.addEventListener('mouseup', end);
			canvas.addEventListener('touchstart', start, { passive: false });
			canvas.addEventListener('touchmove', move, { passive: false });
			canvas.addEventListener('touchend', end);

			$form.find('.awivest-sig-clear').on('click', function () {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				hasInk = false;
				if ($hidden.length) {
					$hidden.val('');
				}
			});

			// On submit, capture the drawn signature into the hidden field.
			$form.on('submit', function () {
				if (hasInk && $hidden.length) {
					$hidden.val(canvas.toDataURL('image/png'));
				}
			});
		});
	});
})(jQuery);
