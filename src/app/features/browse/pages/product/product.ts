import { Component, computed, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CartService } from '../../../../core/services/cart.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { ProductService, ProductFull } from '../../../../core/services/product.service';
import { CategoryService } from '../../../../core/services/category.service';
import { AdSlot } from '../../../../core/components/ad-slot/ad-slot';

@Component({
  selector: 'app-product',
  imports: [RouterLink, AdSlot],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class Product {
  readonly cart = inject(CartService);
  readonly fav = inject(FavoritesService);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private route = inject(ActivatedRoute);

  readonly id = toSignal(
    this.route.paramMap.pipe(map(p => Number(p.get('id')))),
    { initialValue: 0 }
  );

  readonly product = computed(() => this.productService.getById(this.id()));

  readonly relatedProducts = computed(() => {
    const p = this.product();
    return p ? this.productService.getRelated(p.id) : [];
  });

  quantity = 1;

  decrementQuantity(): void {
    if (this.quantity > 1) this.quantity--;
  }

  incrementQuantity(): void {
    this.quantity++;
  }

  getStars(rating: number): string[] {
    const full = Math.floor(rating);
    const stars: string[] = [];
    for (let i = 0; i < full; i++) stars.push('full');
    while (stars.length < 5) stars.push('empty');
    return stars;
  }

  formatPrice(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  readonly CAT_IDS = computed(() => this.categoryService.getNameMap());
}
